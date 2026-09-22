from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import uuid
import secrets
import hashlib
import io
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

import bcrypt
import jwt
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, BackgroundTasks
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors as rl_colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT

# ---------------- Setup ----------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_ALGO = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]

app = FastAPI(title="LabControl API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("labcontrol")


# ---------------- Helpers ----------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()

def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode("utf-8"), h.encode("utf-8"))
    except Exception:
        return False

def create_access_token(user_id: str, email: str, ver: int = 0) -> str:
    payload = {"sub": user_id, "email": email, "ver": ver,
               "exp": now_utc() + timedelta(hours=12), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def create_refresh_token(user_id: str, ver: int = 0) -> str:
    payload = {"sub": user_id, "ver": ver, "exp": now_utc() + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none",
                        max_age=12*3600, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none",
                        max_age=7*24*3600, path="/")


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Não autenticado")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Token inválido")
        user = await db.users.find_one({"id": payload["sub"]}, {"password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Usuário não encontrado")
        if payload.get("ver", 0) != user.get("token_version", 0):
            raise HTTPException(status_code=401, detail="Sessão expirada")
        user.pop("_id", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")


async def require_super_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador global")
    return user


def clean_doc(doc):
    if doc is None:
        return None
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc


# ---------------- Models ----------------
class UserOut(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    role: str
    company_id: Optional[str] = None
    company_name: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str
    password: str


class CompanyIn(BaseModel):
    name: str
    cnpj: Optional[str] = ""
    admin_email: EmailStr
    admin_password: str
    admin_name: str


class ObraIn(BaseModel):
    nome: str
    cliente: str
    endereco: str = ""
    cidade: str = ""
    uf: str = ""
    responsavel: str = ""
    status: Literal["Ativa", "Concluída", "Inativa"] = "Ativa"
    observacoes: str = ""


class ConcretoIn(BaseModel):
    obra_id: str
    data_hora: str  # ISO
    fornecedor: str
    nota: str = ""
    fck: float
    volume: float
    elemento: str
    slump: float
    observacoes: str = ""


class CPIn(BaseModel):
    concreto_id: str
    identificacao: str
    data_moldagem: str  # ISO
    idade: int  # dias
    observacoes: str = ""


class CPBatchIn(BaseModel):
    concreto_id: str
    prefixo: str
    quantidade: int = 2  # 2 CPs por idade padrão
    data_moldagem: str
    idades: List[int] = [7, 28]
    observacoes: str = ""


class RupturaIn(BaseModel):
    cp_id: str
    idade_real: int
    diametro: float  # mm
    carga: float  # kN
    observacoes: str = ""


class EquipamentoIn(BaseModel):
    nome: str
    patrimonio: str = ""
    fabricante: str = ""
    modelo: str = ""
    numero_serie: str = ""
    ultima_calibracao: Optional[str] = None
    proxima_calibracao: Optional[str] = None
    status: Literal["Em dia", "Calibração próxima", "Vencido", "Inativo"] = "Em dia"
    certificado_url: str = ""
    observacoes: str = ""


# ---------------- Auth Endpoints ----------------
@api.post("/auth/login")
async def login(payload: LoginIn, response: Response):
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="E-mail ou senha inválidos")
    ver = user.get("token_version", 0)
    access = create_access_token(user["id"], user["email"], ver)
    refresh = create_refresh_token(user["id"], ver)
    set_auth_cookies(response, access, refresh)
    company_name = None
    if user.get("company_id"):
        c = await db.companies.find_one({"id": user["company_id"]})
        company_name = c["name"] if c else None
    return {
        "id": user["id"], "email": user["email"], "name": user["name"],
        "role": user["role"], "company_id": user.get("company_id"),
        "company_name": company_name,
        "access_token": access,
    }


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Sessão encerrada"}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    company_name = None
    if user.get("company_id"):
        c = await db.companies.find_one({"id": user["company_id"]})
        company_name = c["name"] if c else None
    return {
        "id": user["id"], "email": user["email"], "name": user["name"],
        "role": user["role"], "company_id": user.get("company_id"),
        "company_name": company_name,
    }


@api.post("/auth/forgot-password")
async def forgot(payload: ForgotIn):
    email = payload.email.lower().strip()
    await db.password_reset_requests.insert_one({"email": email, "created_at": now_utc()})
    # Simulate: generate token and log it (per user choice)
    user = await db.users.find_one({"email": email})
    generic = {"message": "Se o e-mail estiver cadastrado, um link de recuperação foi enviado."}
    if not user:
        return generic
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    await db.password_reset_tokens.insert_one({
        "token_hash": token_hash,
        "user_id": user["id"],
        "email": email,
        "expires_at": now_utc() + timedelta(hours=1),
        "used": False,
        "created_at": now_utc(),
    })
    reset_link = f"{os.environ.get('FRONTEND_URL','')}/reset-password?token={token}"
    logger.warning(f"[LabControl] Password reset link for {email}: {reset_link}")
    # V1: return token in response for demo. TODO: send email.
    return {**generic, "_debug_token": token, "_debug_link": reset_link}


@api.post("/auth/reset-password")
async def reset(payload: ResetIn):
    token_hash = hashlib.sha256(payload.token.encode()).hexdigest()
    doc = await db.password_reset_tokens.find_one_and_update(
        {"token_hash": token_hash, "used": False, "expires_at": {"$gt": now_utc()}},
        {"$set": {"used": True}}
    )
    if not doc:
        raise HTTPException(status_code=400, detail="Token inválido, expirado ou já utilizado")
    new_hash = hash_password(payload.password)
    await db.users.update_one(
        {"id": doc["user_id"]},
        {"$set": {"password_hash": new_hash}, "$inc": {"token_version": 1}}
    )
    await db.password_reset_tokens.delete_many({"user_id": doc["user_id"], "used": False})
    return {"message": "Senha redefinida com sucesso"}


# ---------------- Companies (super_admin) ----------------
@api.get("/companies")
async def list_companies(admin: dict = Depends(require_super_admin)):
    items = await db.companies.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items


@api.post("/companies")
async def create_company(payload: CompanyIn, admin: dict = Depends(require_super_admin)):
    admin_email = payload.admin_email.lower().strip()
    if await db.users.find_one({"email": admin_email}):
        raise HTTPException(status_code=400, detail="E-mail do administrador já cadastrado")
    company_id = str(uuid.uuid4())
    company_doc = {
        "id": company_id,
        "name": payload.name,
        "cnpj": payload.cnpj,
        "created_at": iso(now_utc()),
    }
    await db.companies.insert_one(company_doc)
    user_doc = {
        "id": str(uuid.uuid4()),
        "email": admin_email,
        "password_hash": hash_password(payload.admin_password),
        "name": payload.admin_name,
        "role": "company_admin",
        "company_id": company_id,
        "token_version": 0,
        "created_at": iso(now_utc()),
    }
    await db.users.insert_one(user_doc)
    return clean_doc(company_doc)


# ---------------- Tenant helper ----------------
def tenant_filter(user: dict, extra: dict = None) -> dict:
    """Returns MongoDB filter scoped to user's company."""
    if not user.get("company_id"):
        # super_admin without company sees nothing on tenant collections unless we allow
        raise HTTPException(status_code=400, detail="Usuário não vinculado a uma empresa")
    f = {"company_id": user["company_id"]}
    if extra:
        f.update(extra)
    return f


# ---------------- OBRAS ----------------
@api.get("/obras")
async def list_obras(user: dict = Depends(get_current_user)):
    items = await db.obras.find(tenant_filter(user), {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items


@api.post("/obras")
async def create_obra(payload: ObraIn, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc.update({
        "id": str(uuid.uuid4()),
        "company_id": user["company_id"],
        "created_at": iso(now_utc()),
        "created_by": user["id"],
    })
    await db.obras.insert_one(doc)
    return clean_doc(doc)


@api.get("/obras/{obra_id}")
async def get_obra(obra_id: str, user: dict = Depends(get_current_user)):
    doc = await db.obras.find_one(tenant_filter(user, {"id": obra_id}), {"_id": 0})
    if not doc:
        raise HTTPException(404, "Obra não encontrada")
    return doc


@api.put("/obras/{obra_id}")
async def update_obra(obra_id: str, payload: ObraIn, user: dict = Depends(get_current_user)):
    upd = payload.model_dump()
    r = await db.obras.update_one(tenant_filter(user, {"id": obra_id}), {"$set": upd})
    if r.matched_count == 0:
        raise HTTPException(404, "Obra não encontrada")
    doc = await db.obras.find_one({"id": obra_id}, {"_id": 0})
    return doc


@api.delete("/obras/{obra_id}")
async def delete_obra(obra_id: str, user: dict = Depends(get_current_user)):
    r = await db.obras.delete_one(tenant_filter(user, {"id": obra_id}))
    if r.deleted_count == 0:
        raise HTTPException(404, "Obra não encontrada")
    return {"message": "Obra removida"}


# ---------------- CONCRETO ----------------
@api.get("/concretos")
async def list_concretos(obra_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    f = tenant_filter(user)
    if obra_id:
        f["obra_id"] = obra_id
    items = await db.concretos.find(f, {"_id": 0}).sort("data_hora", -1).to_list(1000)
    return items


@api.post("/concretos")
async def create_concreto(payload: ConcretoIn, user: dict = Depends(get_current_user)):
    obra = await db.obras.find_one(tenant_filter(user, {"id": payload.obra_id}))
    if not obra:
        raise HTTPException(404, "Obra não encontrada")
    doc = payload.model_dump()
    doc.update({
        "id": str(uuid.uuid4()),
        "company_id": user["company_id"],
        "obra_nome": obra["nome"],
        "created_at": iso(now_utc()),
        "created_by": user["id"],
    })
    await db.concretos.insert_one(doc)
    return clean_doc(doc)


@api.get("/concretos/{concreto_id}")
async def get_concreto(concreto_id: str, user: dict = Depends(get_current_user)):
    doc = await db.concretos.find_one(tenant_filter(user, {"id": concreto_id}), {"_id": 0})
    if not doc:
        raise HTTPException(404, "Recebimento de concreto não encontrado")
    return doc


@api.delete("/concretos/{concreto_id}")
async def delete_concreto(concreto_id: str, user: dict = Depends(get_current_user)):
    await db.corpos_prova.delete_many(tenant_filter(user, {"concreto_id": concreto_id}))
    r = await db.concretos.delete_one(tenant_filter(user, {"id": concreto_id}))
    if r.deleted_count == 0:
        raise HTTPException(404, "Não encontrado")
    return {"message": "Removido"}


# ---------------- CORPOS DE PROVA ----------------
@api.get("/cps")
async def list_cps(concreto_id: Optional[str] = None, obra_id: Optional[str] = None,
                   status: Optional[str] = None, user: dict = Depends(get_current_user)):
    f = tenant_filter(user)
    if concreto_id:
        f["concreto_id"] = concreto_id
    if obra_id:
        f["obra_id"] = obra_id
    if status:
        f["status"] = status
    items = await db.corpos_prova.find(f, {"_id": 0}).sort("data_prevista_ruptura", 1).to_list(2000)
    return items


@api.post("/cps/batch")
async def create_cps_batch(payload: CPBatchIn, user: dict = Depends(get_current_user)):
    concreto = await db.concretos.find_one(tenant_filter(user, {"id": payload.concreto_id}))
    if not concreto:
        raise HTTPException(404, "Concreto não encontrado")
    moldagem = datetime.fromisoformat(payload.data_moldagem.replace("Z", "+00:00"))
    created = []
    counter = 1
    for idade in payload.idades:
        for _ in range(payload.quantidade):
            cp = {
                "id": str(uuid.uuid4()),
                "company_id": user["company_id"],
                "obra_id": concreto["obra_id"],
                "obra_nome": concreto.get("obra_nome", ""),
                "concreto_id": payload.concreto_id,
                "identificacao": f"{payload.prefixo}-{counter:03d}",
                "data_moldagem": iso(moldagem),
                "idade": idade,
                "data_prevista_ruptura": iso(moldagem + timedelta(days=idade)),
                "status": "Pendente",
                "observacoes": payload.observacoes,
                "fck_nominal": concreto.get("fck"),
                "created_at": iso(now_utc()),
            }
            await db.corpos_prova.insert_one(cp)
            created.append(clean_doc(cp))
            counter += 1
    return {"created": created, "total": len(created)}


@api.post("/cps")
async def create_cp(payload: CPIn, user: dict = Depends(get_current_user)):
    concreto = await db.concretos.find_one(tenant_filter(user, {"id": payload.concreto_id}))
    if not concreto:
        raise HTTPException(404, "Concreto não encontrado")
    moldagem = datetime.fromisoformat(payload.data_moldagem.replace("Z", "+00:00"))
    cp = {
        "id": str(uuid.uuid4()),
        "company_id": user["company_id"],
        "obra_id": concreto["obra_id"],
        "obra_nome": concreto.get("obra_nome", ""),
        "concreto_id": payload.concreto_id,
        "identificacao": payload.identificacao,
        "data_moldagem": iso(moldagem),
        "idade": payload.idade,
        "data_prevista_ruptura": iso(moldagem + timedelta(days=payload.idade)),
        "status": "Pendente",
        "observacoes": payload.observacoes,
        "fck_nominal": concreto.get("fck"),
        "created_at": iso(now_utc()),
    }
    await db.corpos_prova.insert_one(cp)
    return clean_doc(cp)


@api.delete("/cps/{cp_id}")
async def delete_cp(cp_id: str, user: dict = Depends(get_current_user)):
    r = await db.corpos_prova.delete_one(tenant_filter(user, {"id": cp_id}))
    if r.deleted_count == 0:
        raise HTTPException(404, "CP não encontrado")
    await db.rupturas.delete_many(tenant_filter(user, {"cp_id": cp_id}))
    return {"message": "Removido"}


# ---------------- RUPTURA ----------------
@api.get("/rupturas")
async def list_rupturas(obra_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    f = tenant_filter(user)
    if obra_id:
        f["obra_id"] = obra_id
    items = await db.rupturas.find(f, {"_id": 0}).sort("data_ensaio", -1).to_list(1000)
    return items


@api.post("/rupturas")
async def create_ruptura(payload: RupturaIn, user: dict = Depends(get_current_user)):
    cp = await db.corpos_prova.find_one(tenant_filter(user, {"id": payload.cp_id}))
    if not cp:
        raise HTTPException(404, "CP não encontrado")
    # Área = π * d² / 4 em mm² -> converter para cm² dividindo por 100
    area_mm2 = 3.14159265 * (payload.diametro ** 2) / 4
    area_cm2 = area_mm2 / 100
    # Resistência (MPa) = Carga (kN) * 10 / Área (cm²)  (equivale a N/mm²)
    resistencia = round((payload.carga * 10) / area_cm2, 2) if area_cm2 > 0 else 0
    doc = {
        "id": str(uuid.uuid4()),
        "company_id": user["company_id"],
        "cp_id": payload.cp_id,
        "cp_identificacao": cp["identificacao"],
        "obra_id": cp["obra_id"],
        "obra_nome": cp.get("obra_nome", ""),
        "concreto_id": cp["concreto_id"],
        "idade_real": payload.idade_real,
        "diametro": payload.diametro,
        "area_cm2": round(area_cm2, 2),
        "carga_kn": payload.carga,
        "resistencia_mpa": resistencia,
        "fck_nominal": cp.get("fck_nominal"),
        "observacoes": payload.observacoes,
        "data_ensaio": iso(now_utc()),
        "created_by": user["id"],
    }
    await db.rupturas.insert_one(doc)
    await db.corpos_prova.update_one(
        {"id": payload.cp_id},
        {"$set": {"status": "Rompido", "resistencia_mpa": resistencia,
                  "data_ensaio": doc["data_ensaio"]}}
    )
    return clean_doc(doc)


@api.delete("/rupturas/{r_id}")
async def delete_ruptura(r_id: str, user: dict = Depends(get_current_user)):
    doc = await db.rupturas.find_one(tenant_filter(user, {"id": r_id}))
    if not doc:
        raise HTTPException(404, "Não encontrado")
    await db.rupturas.delete_one({"id": r_id})
    await db.corpos_prova.update_one(
        {"id": doc["cp_id"]},
        {"$set": {"status": "Pendente"}, "$unset": {"resistencia_mpa": "", "data_ensaio": ""}}
    )
    return {"message": "Removido"}


# ---------------- EQUIPAMENTOS ----------------
@api.get("/equipamentos")
async def list_equipamentos(user: dict = Depends(get_current_user)):
    items = await db.equipamentos.find(tenant_filter(user), {"_id": 0}).sort("proxima_calibracao", 1).to_list(1000)
    # Recompute status
    today = now_utc().date()
    for it in items:
        p = it.get("proxima_calibracao")
        if p:
            try:
                pdt = datetime.fromisoformat(p.replace("Z", "+00:00")).date()
                delta = (pdt - today).days
                if delta < 0:
                    it["_status_calc"] = "Vencido"
                elif delta <= 30:
                    it["_status_calc"] = "Calibração próxima"
                else:
                    it["_status_calc"] = "Em dia"
                it["_dias_para_calibracao"] = delta
            except Exception:
                pass
    return items


@api.post("/equipamentos")
async def create_equipamento(payload: EquipamentoIn, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc.update({
        "id": str(uuid.uuid4()),
        "company_id": user["company_id"],
        "created_at": iso(now_utc()),
    })
    await db.equipamentos.insert_one(doc)
    return clean_doc(doc)


@api.put("/equipamentos/{eq_id}")
async def update_equipamento(eq_id: str, payload: EquipamentoIn, user: dict = Depends(get_current_user)):
    r = await db.equipamentos.update_one(tenant_filter(user, {"id": eq_id}), {"$set": payload.model_dump()})
    if r.matched_count == 0:
        raise HTTPException(404, "Equipamento não encontrado")
    return await db.equipamentos.find_one({"id": eq_id}, {"_id": 0})


@api.delete("/equipamentos/{eq_id}")
async def delete_equipamento(eq_id: str, user: dict = Depends(get_current_user)):
    r = await db.equipamentos.delete_one(tenant_filter(user, {"id": eq_id}))
    if r.deleted_count == 0:
        raise HTTPException(404, "Não encontrado")
    return {"message": "Removido"}


# ---------------- DASHBOARD ----------------
@api.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    f = tenant_filter(user)
    obras_ativas = await db.obras.count_documents({**f, "status": "Ativa"})
    ensaios_realizados = await db.rupturas.count_documents(f)
    cps_aguardando = await db.corpos_prova.count_documents({**f, "status": "Pendente"})
    # Resultados pendentes: CPs cuja data prevista já passou e ainda pendente
    now_iso = iso(now_utc())
    resultados_pendentes = await db.corpos_prova.count_documents(
        {**f, "status": "Pendente", "data_prevista_ruptura": {"$lte": now_iso}}
    )
    # Equipamentos próximos calibração (30 dias)
    limit_dt = iso(now_utc() + timedelta(days=30))
    equipamentos_prox = await db.equipamentos.count_documents(
        {**f, "proxima_calibracao": {"$lte": limit_dt}}
    )

    obras_recentes = await db.obras.find(f, {"_id": 0}).sort("created_at", -1).limit(5).to_list(5)
    proximos_vencimentos = await db.equipamentos.find(
        {**f, "proxima_calibracao": {"$ne": None}}, {"_id": 0}
    ).sort("proxima_calibracao", 1).limit(6).to_list(6)

    today = now_utc().date()
    for it in proximos_vencimentos:
        try:
            pdt = datetime.fromisoformat(it["proxima_calibracao"].replace("Z", "+00:00")).date()
            it["dias_restantes"] = (pdt - today).days
        except Exception:
            it["dias_restantes"] = None

    return {
        "kpis": {
            "obras_ativas": obras_ativas,
            "ensaios_realizados": ensaios_realizados,
            "cps_aguardando_ruptura": cps_aguardando,
            "resultados_pendentes": resultados_pendentes,
            "calibracoes_proximas": equipamentos_prox,
        },
        "obras_recentes": obras_recentes,
        "proximos_vencimentos": proximos_vencimentos,
    }


# ---------------- RELATÓRIOS PDF ----------------
@api.get("/relatorios/obra/{obra_id}")
async def relatorio_obra_pdf(obra_id: str, user: dict = Depends(get_current_user)):
    obra = await db.obras.find_one(tenant_filter(user, {"id": obra_id}), {"_id": 0})
    if not obra:
        raise HTTPException(404, "Obra não encontrada")
    concretos = await db.concretos.find(tenant_filter(user, {"obra_id": obra_id}), {"_id": 0}).sort("data_hora", -1).to_list(1000)
    company = await db.companies.find_one({"id": user["company_id"]}, {"_id": 0}) or {}
    concreto_ids = [c["id"] for c in concretos]
    cps = await db.corpos_prova.find({"company_id": user["company_id"], "concreto_id": {"$in": concreto_ids}}, {"_id": 0}).to_list(5000)
    rupturas = await db.rupturas.find(tenant_filter(user, {"obra_id": obra_id}), {"_id": 0}).to_list(5000)
    rupt_by_cp = {r["cp_id"]: r for r in rupturas}

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=1.5*cm, rightMargin=1.5*cm,
                            topMargin=1.5*cm, bottomMargin=1.5*cm)
    styles = getSampleStyleSheet()
    title_st = ParagraphStyle('t', parent=styles['Heading1'], fontSize=18, textColor=rl_colors.HexColor("#0f172a"), spaceAfter=6)
    h2 = ParagraphStyle('h2', parent=styles['Heading2'], fontSize=12, textColor=rl_colors.HexColor("#1e293b"), spaceBefore=10, spaceAfter=4)
    normal = ParagraphStyle('n', parent=styles['Normal'], fontSize=9, textColor=rl_colors.HexColor("#334155"))

    story = []
    story.append(Paragraph(f"<b>{company.get('name','LabControl')}</b>", title_st))
    story.append(Paragraph("Relatório de Ensaio de Concreto", h2))
    story.append(Spacer(1, 6))

    header_data = [
        ["Nº Relatório:", f"REL-{obra['id'][:8].upper()}", "Data:", now_utc().strftime("%d/%m/%Y")],
        ["Obra:", obra['nome'], "Cliente:", obra.get('cliente','-')],
        ["Endereço:", f"{obra.get('endereco','')} - {obra.get('cidade','')}/{obra.get('uf','')}", "Responsável:", obra.get('responsavel','-')],
    ]
    ht = Table(header_data, colWidths=[3*cm, 6*cm, 3*cm, 5*cm])
    ht.setStyle(TableStyle([
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('TEXTCOLOR', (0,0), (0,-1), rl_colors.HexColor("#64748b")),
        ('TEXTCOLOR', (2,0), (2,-1), rl_colors.HexColor("#64748b")),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(ht)
    story.append(Spacer(1, 10))

    story.append(Paragraph("Corpos de Prova e Resultados", h2))
    tdata = [["CP", "Idade", "Data Moldagem", "Data Ruptura", "Diâm.(mm)", "Área(cm²)", "Carga(kN)", "MPa", "FCK Nom."]]
    for cp in sorted(cps, key=lambda x: x.get("identificacao","")):
        r = rupt_by_cp.get(cp["id"])
        molda = cp["data_moldagem"][:10] if cp.get("data_moldagem") else "-"
        prev = cp["data_prevista_ruptura"][:10] if cp.get("data_prevista_ruptura") else "-"
        if r:
            tdata.append([cp["identificacao"], f"{r['idade_real']}d", molda, r["data_ensaio"][:10],
                          f"{r['diametro']:.0f}", f"{r['area_cm2']:.2f}", f"{r['carga_kn']:.1f}",
                          f"{r['resistencia_mpa']:.2f}", f"{cp.get('fck_nominal','-')}"])
        else:
            tdata.append([cp["identificacao"], f"{cp['idade']}d", molda, prev, "-", "-", "-", "Pendente", f"{cp.get('fck_nominal','-')}"])
    t = Table(tdata, colWidths=[2*cm, 1.3*cm, 2.3*cm, 2.3*cm, 1.6*cm, 1.6*cm, 1.6*cm, 1.5*cm, 1.7*cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), rl_colors.HexColor("#0f172a")),
        ('TEXTCOLOR', (0,0), (-1,0), rl_colors.white),
        ('FONTSIZE', (0,0), (-1,-1), 8),
        ('GRID', (0,0), (-1,-1), 0.25, rl_colors.HexColor("#cbd5e1")),
        ('ALIGN', (1,1), (-1,-1), 'CENTER'),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [rl_colors.white, rl_colors.HexColor("#f8fafc")]),
    ]))
    story.append(t)

    story.append(Spacer(1, 12))
    story.append(Paragraph(
        "Observações: Resultados apresentados conforme moldagem e ruptura registradas no sistema LabControl. "
        "Os critérios de aceitação (aprovação/reprovação) devem ser configurados conforme normas aplicáveis (NBR 5738 / NBR 5739).",
        normal
    ))
    story.append(Spacer(1, 24))
    story.append(Paragraph(f"_____________________________________<br/>Responsável Técnico<br/>{user.get('name','')}", normal))

    doc.build(story)
    buf.seek(0)
    from fastapi.responses import Response as FResp
    filename = f"relatorio_{obra['nome'].replace(' ','_')}.pdf"
    return FResp(buf.getvalue(), media_type="application/pdf",
                 headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# ---------------- Seed ----------------
async def seed_data():
    # Indexes
    await db.users.create_index("email", unique=True)
    await db.password_reset_tokens.create_index("token_hash", unique=True)
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.obras.create_index([("company_id", 1), ("created_at", -1)])
    await db.concretos.create_index([("company_id", 1), ("obra_id", 1)])
    await db.corpos_prova.create_index([("company_id", 1), ("concreto_id", 1)])
    await db.rupturas.create_index([("company_id", 1), ("cp_id", 1)])
    await db.equipamentos.create_index([("company_id", 1)])

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@labcontrol.com").lower()
    admin_pw = os.environ.get("ADMIN_PASSWORD", "admin123")

    # Ensure demo company
    demo_company = await db.companies.find_one({"name": "LabControl Demo"})
    if not demo_company:
        demo_company = {
            "id": str(uuid.uuid4()),
            "name": "LabControl Demo",
            "cnpj": "00.000.000/0001-00",
            "created_at": iso(now_utc()),
        }
        await db.companies.insert_one(demo_company)

    # Ensure super admin user (belongs to demo company for convenient testing)
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "password_hash": hash_password(admin_pw),
            "name": "Edésio Alexandre",
            "role": "super_admin",
            "company_id": demo_company["id"],
            "token_version": 0,
            "created_at": iso(now_utc()),
        })
    else:
        # Reset password if changed
        if not verify_password(admin_pw, existing.get("password_hash", "")):
            await db.users.update_one({"email": admin_email},
                                      {"$set": {"password_hash": hash_password(admin_pw)}})
        if not existing.get("company_id"):
            await db.users.update_one({"email": admin_email},
                                      {"$set": {"company_id": demo_company["id"], "role": "super_admin"}})

    # Demo user (technician)
    tech_email = "tecnico@labcontrol.com"
    if not await db.users.find_one({"email": tech_email}):
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": tech_email,
            "password_hash": hash_password("tecnico123"),
            "name": "João Silva",
            "role": "tecnico",
            "company_id": demo_company["id"],
            "token_version": 0,
            "created_at": iso(now_utc()),
        })

    # Sample data only if empty
    if await db.obras.count_documents({"company_id": demo_company["id"]}) == 0:
        obra1_id = str(uuid.uuid4())
        obra2_id = str(uuid.uuid4())
        await db.obras.insert_many([
            {"id": obra1_id, "company_id": demo_company["id"], "nome": "Residencial Jardim das Acácias",
             "cliente": "Construtora Alfa", "endereco": "Rua das Palmeiras, 500", "cidade": "Itabira", "uf": "MG",
             "responsavel": "Eng. Pedro Souza", "status": "Ativa", "observacoes": "",
             "created_at": iso(now_utc()), "created_by": ""},
            {"id": obra2_id, "company_id": demo_company["id"], "nome": "Galpão Industrial Rio Doce",
             "cliente": "Metalúrgica Rio Doce", "endereco": "Av. Industrial, 1200", "cidade": "João Monlevade", "uf": "MG",
             "responsavel": "Eng. Ana Ferreira", "status": "Ativa", "observacoes": "",
             "created_at": iso(now_utc()), "created_by": ""},
        ])
        # Concreto para obra1
        moldagem = now_utc() - timedelta(days=5)
        concreto_id = str(uuid.uuid4())
        await db.concretos.insert_one({
            "id": concreto_id, "company_id": demo_company["id"], "obra_id": obra1_id,
            "obra_nome": "Residencial Jardim das Acácias",
            "data_hora": iso(moldagem), "fornecedor": "Cimento Votorantim", "nota": "4587",
            "fck": 30.0, "volume": 8.0, "elemento": "Pilar P12", "slump": 120.0,
            "observacoes": "Concreto bombeado - Traço 1:2:3",
            "created_at": iso(now_utc()), "created_by": "",
        })
        # 4 CPs (2 x 7d, 2 x 28d)
        counter = 1
        for idade in [7, 28]:
            for _ in range(2):
                await db.corpos_prova.insert_one({
                    "id": str(uuid.uuid4()), "company_id": demo_company["id"],
                    "obra_id": obra1_id, "obra_nome": "Residencial Jardim das Acácias",
                    "concreto_id": concreto_id,
                    "identificacao": f"CP-{counter:03d}",
                    "data_moldagem": iso(moldagem), "idade": idade,
                    "data_prevista_ruptura": iso(moldagem + timedelta(days=idade)),
                    "status": "Pendente", "observacoes": "", "fck_nominal": 30.0,
                    "created_at": iso(now_utc()),
                })
                counter += 1
        # Equipamentos
        await db.equipamentos.insert_many([
            {"id": str(uuid.uuid4()), "company_id": demo_company["id"], "nome": "Prensa Hidráulica 2000kN",
             "patrimonio": "EQ-001", "fabricante": "EMIC", "modelo": "PC200", "numero_serie": "SN12345",
             "ultima_calibracao": iso(now_utc() - timedelta(days=340)),
             "proxima_calibracao": iso(now_utc() + timedelta(days=25)),
             "status": "Calibração próxima", "certificado_url": "", "observacoes": "",
             "created_at": iso(now_utc())},
            {"id": str(uuid.uuid4()), "company_id": demo_company["id"], "nome": "Balança 5000kg",
             "patrimonio": "EQ-002", "fabricante": "Toledo", "modelo": "9091", "numero_serie": "SN99012",
             "ultima_calibracao": iso(now_utc() - timedelta(days=200)),
             "proxima_calibracao": iso(now_utc() + timedelta(days=165)),
             "status": "Em dia", "certificado_url": "", "observacoes": "",
             "created_at": iso(now_utc())},
            {"id": str(uuid.uuid4()), "company_id": demo_company["id"], "nome": "Paquímetro Digital 200mm",
             "patrimonio": "EQ-003", "fabricante": "Mitutoyo", "modelo": "500-196", "numero_serie": "PQ7788",
             "ultima_calibracao": iso(now_utc() - timedelta(days=380)),
             "proxima_calibracao": iso(now_utc() - timedelta(days=15)),
             "status": "Vencido", "certificado_url": "", "observacoes": "",
             "created_at": iso(now_utc())},
        ])

    # Write test credentials
    try:
        os.makedirs("/app/memory", exist_ok=True)
        with open("/app/memory/test_credentials.md", "w") as f:
            f.write(f"""# LabControl Test Credentials

## Super Admin (Global)
- Email: `{admin_email}`
- Password: `{admin_pw}`
- Role: super_admin
- Can create companies via POST /api/companies

## Demo Technician
- Email: `tecnico@labcontrol.com`
- Password: `tecnico123`
- Role: tecnico
- Company: LabControl Demo

## Auth Endpoints
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me
- POST /api/auth/forgot-password
- POST /api/auth/reset-password
""")
    except Exception as e:
        logger.warning(f"Could not write test credentials: {e}")


# ---------------- App wiring ----------------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("FRONTEND_URL", "*"), "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    try:
        await seed_data()
        logger.info("LabControl seeded successfully.")
    except Exception as e:
        logger.error(f"Seed error: {e}")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


@api.get("/")
async def root():
    return {"service": "LabControl API", "version": "1.0.0"}
