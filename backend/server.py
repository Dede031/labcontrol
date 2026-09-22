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


async def require_tecnico(user: dict = Depends(get_current_user)) -> dict:
    """Only tecnico (validador) or super_admin can validate ruptures."""
    if user.get("role") not in ("tecnico", "super_admin"):
        raise HTTPException(status_code=403, detail="Apenas o Técnico de Qualidade pode validar")
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


class UpdateProfileIn(BaseModel):
    name: Optional[str] = None
    crea: Optional[str] = None
    telefone: Optional[str] = None


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
    quantidade: int = 2  # 2 CPs por idade padrão
    data_moldagem: str
    idades: List[int] = [7, 28]
    observacoes: str = ""


class ValidarIn(BaseModel):
    aprovado: bool
    observacoes: str = ""


class SoloAmostraIn(BaseModel):
    obra_id: str
    identificacao: str
    local: str = ""
    profundidade: str = ""
    descricao: str = ""
    data_coleta: Optional[str] = None
    coordenadas: str = ""       # Livre: lat/lng ou UTM
    estaca: str = ""            # Ex: "E-25+3.50m"
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    observacoes: str = ""


class PontoPDL(BaseModel):
    profundidade_cm: float
    golpes: int


class PDLIn(BaseModel):
    amostra_id: str
    data_ensaio: str
    operador: str = ""
    pontos: List[PontoPDL]
    observacoes: str = ""


class PontoCompactacao(BaseModel):
    umidade: float  # %
    densidade_seca: float  # g/cm³


class CompactacaoIn(BaseModel):
    amostra_id: str
    data_ensaio: str
    energia: Literal["Normal", "Intermediária", "Modificada"] = "Normal"
    pontos: List[PontoCompactacao]
    observacoes: str = ""


class HilfIn(BaseModel):
    amostra_id: str
    data_ensaio: str
    umidade_campo: float  # %
    densidade_campo: float  # g/cm³ (aparente)
    densidade_max_lab: float  # g/cm³ (referência do Proctor)
    umidade_otima_lab: float  # %
    grau_compactacao_meta: float = 100.0  # %
    observacoes: str = ""


class PontoCBR(BaseModel):
    penetracao_mm: float  # 0.63, 1.27, 1.90, 2.54, 3.17, 3.81, 4.44, 5.08, 7.62, 10.16, 12.7 mm
    carga_kn: float


class CBRIn(BaseModel):
    amostra_id: str
    data_ensaio: str
    umidade_moldagem: float = 0
    densidade_seca: float = 0
    expansao_percent: float = 0
    pontos: List[PontoCBR]
    observacoes: str = ""


class PontoGranulometria(BaseModel):
    peneira_mm: float  # abertura da peneira em mm
    peneira_nome: str = ""  # ex: "4", "10", "40", "200"
    percent_passante: float  # 0-100


class GranulometriaIn(BaseModel):
    amostra_id: str
    data_ensaio: str
    peso_total: float = 0  # g
    pontos: List[PontoGranulometria]
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
        "crea": user.get("crea", ""),
        "telefone": user.get("telefone", ""),
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
        "crea": user.get("crea", ""),
        "telefone": user.get("telefone", ""),
    }


@api.patch("/auth/me")
async def update_me(payload: UpdateProfileIn, user: dict = Depends(get_current_user)):
    upd = {}
    if payload.name is not None:
        upd["name"] = payload.name
    if payload.crea is not None:
        upd["crea"] = payload.crea
    if payload.telefone is not None:
        upd["telefone"] = payload.telefone
    if not upd:
        return await me(user)
    await db.users.update_one({"id": user["id"]}, {"$set": upd})
    updated = await db.users.find_one({"id": user["id"]}, {"password_hash": 0, "_id": 0})
    return {"message": "Perfil atualizado", "user": updated}


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
    # Compute next série number for this obra (sequential per obra)
    last = await db.concretos.find_one(
        tenant_filter(user, {"obra_id": payload.obra_id}),
        sort=[("serie_numero", -1)],
    )
    serie_numero = (last.get("serie_numero", 0) if last else 0) + 1
    doc = payload.model_dump()
    doc.update({
        "id": str(uuid.uuid4()),
        "company_id": user["company_id"],
        "obra_nome": obra["nome"],
        "serie_numero": serie_numero,
        "serie_label": f"S-{serie_numero:03d}",
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
                   status: Optional[str] = None, vencidos_only: bool = False,
                   user: dict = Depends(get_current_user)):
    f = tenant_filter(user)
    if concreto_id:
        f["concreto_id"] = concreto_id
    if obra_id:
        f["obra_id"] = obra_id
    if status:
        f["status"] = status
    if vencidos_only:
        # Only CPs with pending status AND scheduled rupture date at or before now
        f["status"] = "Pendente"
        f["data_prevista_ruptura"] = {"$lte": iso(now_utc())}
    items = await db.corpos_prova.find(f, {"_id": 0}).sort("data_prevista_ruptura", 1).to_list(2000)
    return items


@api.post("/cps/batch")
async def create_cps_batch(payload: CPBatchIn, user: dict = Depends(get_current_user)):
    concreto = await db.concretos.find_one(tenant_filter(user, {"id": payload.concreto_id}))
    if not concreto:
        raise HTTPException(404, "Concreto não encontrado")
    moldagem = datetime.fromisoformat(payload.data_moldagem.replace("Z", "+00:00"))
    serie_label = concreto.get("serie_label", f"S-{concreto.get('serie_numero', 1):03d}")
    created = []
    letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    letter_idx = 0
    for idade in payload.idades:
        for _ in range(payload.quantidade):
            letter = letters[letter_idx % len(letters)]
            letter_idx += 1
            cp = {
                "id": str(uuid.uuid4()),
                "company_id": user["company_id"],
                "obra_id": concreto["obra_id"],
                "obra_nome": concreto.get("obra_nome", ""),
                "concreto_id": payload.concreto_id,
                "serie_label": serie_label,
                "serie_numero": concreto.get("serie_numero"),
                "identificacao": f"{serie_label}-{letter}",
                "data_moldagem": iso(moldagem),
                "idade": idade,
                "data_prevista_ruptura": iso(moldagem + timedelta(days=idade)),
                "status": "Pendente",
                "observacoes": payload.observacoes,
                "fck_nominal": concreto.get("fck"),
                "nota_fiscal": concreto.get("nota", ""),
                "created_at": iso(now_utc()),
            }
            await db.corpos_prova.insert_one(cp)
            created.append(clean_doc(cp))
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
    fck_nom = cp.get("fck_nominal")
    conforme = None
    if fck_nom is not None:
        conforme = bool(resistencia >= float(fck_nom))
    doc = {
        "id": str(uuid.uuid4()),
        "company_id": user["company_id"],
        "cp_id": payload.cp_id,
        "cp_identificacao": cp["identificacao"],
        "serie_label": cp.get("serie_label"),
        "obra_id": cp["obra_id"],
        "obra_nome": cp.get("obra_nome", ""),
        "concreto_id": cp["concreto_id"],
        "idade_real": payload.idade_real,
        "diametro": payload.diametro,
        "area_cm2": round(area_cm2, 2),
        "carga_kn": payload.carga,
        "resistencia_mpa": resistencia,
        "fck_nominal": fck_nom,
        "conforme": conforme,
        "observacoes": payload.observacoes,
        "validacao_status": "Aguardando validação",
        "validado_por": None,
        "validado_por_nome": None,
        "validado_em": None,
        "validacao_observacoes": "",
        "data_ensaio": iso(now_utc()),
        "created_by": user["id"],
        "created_by_nome": user.get("name", ""),
    }
    await db.rupturas.insert_one(doc)
    await db.corpos_prova.update_one(
        {"id": payload.cp_id},
        {"$set": {"status": "Rompido", "resistencia_mpa": resistencia,
                  "conforme": conforme,
                  "validacao_status": "Aguardando validação",
                  "data_ensaio": doc["data_ensaio"]}}
    )
    return clean_doc(doc)


@api.put("/rupturas/{r_id}/validar")
async def validar_ruptura(r_id: str, payload: ValidarIn, tec: dict = Depends(require_tecnico)):
    doc = await db.rupturas.find_one(tenant_filter(tec, {"id": r_id}))
    if not doc:
        raise HTTPException(404, "Ruptura não encontrada")
    status_val = "Validado" if payload.aprovado else "Rejeitado"
    await db.rupturas.update_one({"id": r_id}, {"$set": {
        "validacao_status": status_val,
        "validado_por": tec["id"],
        "validado_por_nome": tec.get("name", ""),
        "validado_em": iso(now_utc()),
        "validacao_observacoes": payload.observacoes,
    }})
    await db.corpos_prova.update_one({"id": doc["cp_id"]},
                                     {"$set": {"validacao_status": status_val}})
    return {"message": "Validação registrada", "status": status_val}


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


# ---------------- SOLOS: amostras e ensaios ----------------
@api.get("/solos/amostras")
async def list_amostras(obra_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    f = tenant_filter(user)
    if obra_id:
        f["obra_id"] = obra_id
    items = await db.amostras_solo.find(f, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items


@api.post("/solos/amostras")
async def create_amostra(payload: SoloAmostraIn, user: dict = Depends(get_current_user)):
    obra = await db.obras.find_one(tenant_filter(user, {"id": payload.obra_id}))
    if not obra:
        raise HTTPException(404, "Obra não encontrada")
    doc = payload.model_dump()
    doc.update({
        "id": str(uuid.uuid4()),
        "company_id": user["company_id"],
        "obra_nome": obra["nome"],
        "created_at": iso(now_utc()),
    })
    await db.amostras_solo.insert_one(doc)
    return clean_doc(doc)


@api.delete("/solos/amostras/{a_id}")
async def delete_amostra(a_id: str, user: dict = Depends(get_current_user)):
    await db.ensaios_pdl.delete_many(tenant_filter(user, {"amostra_id": a_id}))
    await db.ensaios_compactacao.delete_many(tenant_filter(user, {"amostra_id": a_id}))
    await db.ensaios_hilf.delete_many(tenant_filter(user, {"amostra_id": a_id}))
    r = await db.amostras_solo.delete_one(tenant_filter(user, {"id": a_id}))
    if r.deleted_count == 0:
        raise HTTPException(404, "Amostra não encontrada")
    return {"message": "Removida"}


@api.get("/solos/pdl")
async def list_pdl(amostra_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    f = tenant_filter(user)
    if amostra_id:
        f["amostra_id"] = amostra_id
    items = await db.ensaios_pdl.find(f, {"_id": 0}).sort("data_ensaio", -1).to_list(500)
    return items


@api.post("/solos/pdl")
async def create_pdl(payload: PDLIn, user: dict = Depends(get_current_user)):
    amostra = await db.amostras_solo.find_one(tenant_filter(user, {"id": payload.amostra_id}))
    if not amostra:
        raise HTTPException(404, "Amostra não encontrada")
    pontos = [p.model_dump() for p in payload.pontos]
    doc = {
        "id": str(uuid.uuid4()),
        "company_id": user["company_id"],
        "amostra_id": payload.amostra_id,
        "obra_id": amostra["obra_id"],
        "obra_nome": amostra.get("obra_nome", ""),
        "amostra_identificacao": amostra["identificacao"],
        "data_ensaio": payload.data_ensaio,
        "operador": payload.operador,
        "pontos": pontos,
        "observacoes": payload.observacoes,
        "created_at": iso(now_utc()),
    }
    await db.ensaios_pdl.insert_one(doc)
    return clean_doc(doc)


@api.delete("/solos/pdl/{e_id}")
async def delete_pdl(e_id: str, user: dict = Depends(get_current_user)):
    r = await db.ensaios_pdl.delete_one(tenant_filter(user, {"id": e_id}))
    if r.deleted_count == 0:
        raise HTTPException(404, "Não encontrado")
    return {"message": "Removido"}


@api.get("/solos/compactacao")
async def list_compactacao(amostra_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    f = tenant_filter(user)
    if amostra_id:
        f["amostra_id"] = amostra_id
    items = await db.ensaios_compactacao.find(f, {"_id": 0}).sort("data_ensaio", -1).to_list(500)
    return items


@api.post("/solos/compactacao")
async def create_compactacao(payload: CompactacaoIn, user: dict = Depends(get_current_user)):
    amostra = await db.amostras_solo.find_one(tenant_filter(user, {"id": payload.amostra_id}))
    if not amostra:
        raise HTTPException(404, "Amostra não encontrada")
    pts = [p.model_dump() for p in payload.pontos]
    # Calcular curva: parabola ajustada aos 3 pontos centrais (maior densidade)
    umidade_otima = None
    densidade_max = None
    if len(pts) >= 3:
        # Ordenar por umidade
        sorted_pts = sorted(pts, key=lambda p: p["umidade"])
        # Fit parabola y = a*x² + b*x + c using numpy
        try:
            import numpy as np
            xs = np.array([p["umidade"] for p in sorted_pts])
            ys = np.array([p["densidade_seca"] for p in sorted_pts])
            coeffs = np.polyfit(xs, ys, 2)  # a, b, c
            a, b, c = coeffs
            if a < 0:  # parabola down (real)
                umidade_otima = round(float(-b / (2 * a)), 2)
                densidade_max = round(float(a * umidade_otima**2 + b * umidade_otima + c), 3)
            else:
                # fallback: max point
                idx = int(ys.argmax())
                umidade_otima = round(float(xs[idx]), 2)
                densidade_max = round(float(ys[idx]), 3)
        except Exception:
            idx = max(range(len(pts)), key=lambda i: pts[i]["densidade_seca"])
            umidade_otima = round(pts[idx]["umidade"], 2)
            densidade_max = round(pts[idx]["densidade_seca"], 3)
    doc = {
        "id": str(uuid.uuid4()),
        "company_id": user["company_id"],
        "amostra_id": payload.amostra_id,
        "obra_id": amostra["obra_id"],
        "obra_nome": amostra.get("obra_nome", ""),
        "amostra_identificacao": amostra["identificacao"],
        "data_ensaio": payload.data_ensaio,
        "energia": payload.energia,
        "pontos": pts,
        "umidade_otima": umidade_otima,
        "densidade_max": densidade_max,
        "observacoes": payload.observacoes,
        "created_at": iso(now_utc()),
    }
    await db.ensaios_compactacao.insert_one(doc)
    return clean_doc(doc)


@api.delete("/solos/compactacao/{e_id}")
async def delete_compactacao(e_id: str, user: dict = Depends(get_current_user)):
    r = await db.ensaios_compactacao.delete_one(tenant_filter(user, {"id": e_id}))
    if r.deleted_count == 0:
        raise HTTPException(404, "Não encontrado")
    return {"message": "Removido"}


@api.get("/solos/hilf")
async def list_hilf(amostra_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    f = tenant_filter(user)
    if amostra_id:
        f["amostra_id"] = amostra_id
    items = await db.ensaios_hilf.find(f, {"_id": 0}).sort("data_ensaio", -1).to_list(500)
    return items


@api.post("/solos/hilf")
async def create_hilf(payload: HilfIn, user: dict = Depends(get_current_user)):
    amostra = await db.amostras_solo.find_one(tenant_filter(user, {"id": payload.amostra_id}))
    if not amostra:
        raise HTTPException(404, "Amostra não encontrada")
    # Grau de compactação (GC) = densidade_seca_campo / densidade_max_lab * 100
    # Aproxima densidade seca de campo: rho_seca = rho_aparente / (1 + w/100)
    d_seca_campo = payload.densidade_campo / (1 + payload.umidade_campo / 100)
    gc = (d_seca_campo / payload.densidade_max_lab) * 100 if payload.densidade_max_lab > 0 else 0
    desvio_umidade = payload.umidade_campo - payload.umidade_otima_lab
    conforme = gc >= payload.grau_compactacao_meta
    doc = {
        "id": str(uuid.uuid4()),
        "company_id": user["company_id"],
        "amostra_id": payload.amostra_id,
        "obra_id": amostra["obra_id"],
        "obra_nome": amostra.get("obra_nome", ""),
        "amostra_identificacao": amostra["identificacao"],
        "data_ensaio": payload.data_ensaio,
        "umidade_campo": payload.umidade_campo,
        "densidade_campo": payload.densidade_campo,
        "densidade_seca_campo": round(d_seca_campo, 3),
        "densidade_max_lab": payload.densidade_max_lab,
        "umidade_otima_lab": payload.umidade_otima_lab,
        "grau_compactacao_meta": payload.grau_compactacao_meta,
        "grau_compactacao": round(gc, 2),
        "desvio_umidade": round(desvio_umidade, 2),
        "conforme": conforme,
        "observacoes": payload.observacoes,
        "created_at": iso(now_utc()),
    }
    await db.ensaios_hilf.insert_one(doc)
    return clean_doc(doc)


@api.delete("/solos/hilf/{e_id}")
async def delete_hilf(e_id: str, user: dict = Depends(get_current_user)):
    r = await db.ensaios_hilf.delete_one(tenant_filter(user, {"id": e_id}))
    if r.deleted_count == 0:
        raise HTTPException(404, "Não encontrado")
    return {"message": "Removido"}


# --- CBR ---
@api.get("/solos/cbr")
async def list_cbr(amostra_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    f = tenant_filter(user)
    if amostra_id:
        f["amostra_id"] = amostra_id
    items = await db.ensaios_cbr.find(f, {"_id": 0}).sort("data_ensaio", -1).to_list(500)
    return items


@api.post("/solos/cbr")
async def create_cbr(payload: CBRIn, user: dict = Depends(get_current_user)):
    amostra = await db.amostras_solo.find_one(tenant_filter(user, {"id": payload.amostra_id}))
    if not amostra:
        raise HTTPException(404, "Amostra não encontrada")
    # Ordena por penetração
    pts = sorted([p.model_dump() for p in payload.pontos], key=lambda p: p["penetracao_mm"])
    # Calcular tensão (kgf/cm²) para pistão de 19.4 cm² (área padrão CBR ~ 3.24 in² = 20.9 cm²);
    # Padrão brasileiro: pistão 4.96 cm² -> usar área padrão 19.35 cm² (2 pol²).
    AREA_PISTAO_CM2 = 19.35
    for p in pts:
        # Tensão = carga(kN) * 1000 / area(cm²) -> N/cm² ; converter para kgf/cm² dividindo por 9.807
        tensao_kgfcm2 = (p["carga_kn"] * 1000.0 / AREA_PISTAO_CM2) / 9.807
        p["tensao_kgfcm2"] = round(tensao_kgfcm2, 3)
    # CBR = tensão medida / tensão padrão * 100
    # 2.54mm -> 70 kgf/cm² ; 5.08mm -> 105 kgf/cm²
    def find_tensao(target):
        for p in pts:
            if abs(p["penetracao_mm"] - target) < 0.01:
                return p["tensao_kgfcm2"]
        # linear interp
        below = [p for p in pts if p["penetracao_mm"] < target]
        above = [p for p in pts if p["penetracao_mm"] > target]
        if below and above:
            a, b = below[-1], above[0]
            return a["tensao_kgfcm2"] + (b["tensao_kgfcm2"] - a["tensao_kgfcm2"]) * (
                (target - a["penetracao_mm"]) / (b["penetracao_mm"] - a["penetracao_mm"])
            )
        return None
    t254 = find_tensao(2.54)
    t508 = find_tensao(5.08)
    cbr_254 = (t254 / 70.0) * 100 if t254 else None
    cbr_508 = (t508 / 105.0) * 100 if t508 else None
    cbr_final = None
    if cbr_254 is not None and cbr_508 is not None:
        cbr_final = round(max(cbr_254, cbr_508), 2)
    elif cbr_254 is not None:
        cbr_final = round(cbr_254, 2)
    doc = {
        "id": str(uuid.uuid4()),
        "company_id": user["company_id"],
        "amostra_id": payload.amostra_id,
        "obra_id": amostra["obra_id"],
        "obra_nome": amostra.get("obra_nome", ""),
        "amostra_identificacao": amostra["identificacao"],
        "data_ensaio": payload.data_ensaio,
        "umidade_moldagem": payload.umidade_moldagem,
        "densidade_seca": payload.densidade_seca,
        "expansao_percent": payload.expansao_percent,
        "pontos": pts,
        "cbr_254": round(cbr_254, 2) if cbr_254 else None,
        "cbr_508": round(cbr_508, 2) if cbr_508 else None,
        "cbr_final": cbr_final,
        "observacoes": payload.observacoes,
        "created_at": iso(now_utc()),
    }
    await db.ensaios_cbr.insert_one(doc)
    return clean_doc(doc)


@api.delete("/solos/cbr/{e_id}")
async def delete_cbr(e_id: str, user: dict = Depends(get_current_user)):
    r = await db.ensaios_cbr.delete_one(tenant_filter(user, {"id": e_id}))
    if r.deleted_count == 0:
        raise HTTPException(404, "Não encontrado")
    return {"message": "Removido"}


# --- Granulometria ---
@api.get("/solos/granulometria")
async def list_granulometria(amostra_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    f = tenant_filter(user)
    if amostra_id:
        f["amostra_id"] = amostra_id
    items = await db.ensaios_granulometria.find(f, {"_id": 0}).sort("data_ensaio", -1).to_list(500)
    return items


@api.post("/solos/granulometria")
async def create_granulometria(payload: GranulometriaIn, user: dict = Depends(get_current_user)):
    amostra = await db.amostras_solo.find_one(tenant_filter(user, {"id": payload.amostra_id}))
    if not amostra:
        raise HTTPException(404, "Amostra não encontrada")
    pts = sorted([p.model_dump() for p in payload.pontos], key=lambda p: -p["peneira_mm"])
    # Calcular D10, D30, D60 e coeficientes Cu (uniformidade) e Cc (curvatura)
    def diametro_para_percent(pct_target):
        # pts ordenados de maior peneira para menor. % passante geralmente diminui com peneira menor
        # Encontrar dois pontos que cruzam o pct_target
        sorted_asc = sorted(pts, key=lambda p: p["peneira_mm"])
        for i in range(len(sorted_asc) - 1):
            p1, p2 = sorted_asc[i], sorted_asc[i + 1]
            if (p1["percent_passante"] - pct_target) * (p2["percent_passante"] - pct_target) <= 0:
                # linear interp em log
                import math
                if p1["percent_passante"] == p2["percent_passante"]:
                    return p1["peneira_mm"]
                lp1 = math.log10(max(p1["peneira_mm"], 1e-6))
                lp2 = math.log10(max(p2["peneira_mm"], 1e-6))
                frac = (pct_target - p1["percent_passante"]) / (p2["percent_passante"] - p1["percent_passante"])
                return round(10 ** (lp1 + frac * (lp2 - lp1)), 4)
        return None
    d10 = diametro_para_percent(10)
    d30 = diametro_para_percent(30)
    d60 = diametro_para_percent(60)
    cu = round(d60 / d10, 2) if d10 and d60 else None
    cc = round((d30 * d30) / (d10 * d60), 2) if d10 and d30 and d60 else None
    # Frações (%) — pedregulho (>4.75mm), areia (0.075-4.75mm), finos (<0.075mm)
    def pct_na_peneira(mm):
        for p in pts:
            if abs(p["peneira_mm"] - mm) < 1e-3:
                return p["percent_passante"]
        # interp
        sorted_asc = sorted(pts, key=lambda p: p["peneira_mm"])
        for i in range(len(sorted_asc) - 1):
            p1, p2 = sorted_asc[i], sorted_asc[i + 1]
            if p1["peneira_mm"] <= mm <= p2["peneira_mm"] and p2["peneira_mm"] != p1["peneira_mm"]:
                return p1["percent_passante"] + (p2["percent_passante"] - p1["percent_passante"]) * \
                    ((mm - p1["peneira_mm"]) / (p2["peneira_mm"] - p1["peneira_mm"]))
        return None
    pct_475 = pct_na_peneira(4.75)
    pct_0075 = pct_na_peneira(0.075)
    pedregulho = round(100 - pct_475, 2) if pct_475 is not None else None
    finos = round(pct_0075, 2) if pct_0075 is not None else None
    areia = round(100 - (pedregulho or 0) - (finos or 0), 2) if (pedregulho is not None and finos is not None) else None
    doc = {
        "id": str(uuid.uuid4()),
        "company_id": user["company_id"],
        "amostra_id": payload.amostra_id,
        "obra_id": amostra["obra_id"],
        "obra_nome": amostra.get("obra_nome", ""),
        "amostra_identificacao": amostra["identificacao"],
        "data_ensaio": payload.data_ensaio,
        "peso_total": payload.peso_total,
        "pontos": pts,
        "d10": d10, "d30": d30, "d60": d60,
        "cu": cu, "cc": cc,
        "pct_pedregulho": pedregulho,
        "pct_areia": areia,
        "pct_finos": finos,
        "observacoes": payload.observacoes,
        "created_at": iso(now_utc()),
    }
    await db.ensaios_granulometria.insert_one(doc)
    return clean_doc(doc)


@api.delete("/solos/granulometria/{e_id}")
async def delete_granulometria(e_id: str, user: dict = Depends(get_current_user)):
    r = await db.ensaios_granulometria.delete_one(tenant_filter(user, {"id": e_id}))
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
    tdata = [["CP", "Série", "Idade", "Moldagem", "Ruptura", "Diâm.(mm)", "Área(cm²)", "Carga(kN)", "MPa", "FCK", "Situação"]]
    for cp in sorted(cps, key=lambda x: x.get("identificacao","")):
        r = rupt_by_cp.get(cp["id"])
        molda = cp["data_moldagem"][:10] if cp.get("data_moldagem") else "-"
        prev = cp["data_prevista_ruptura"][:10] if cp.get("data_prevista_ruptura") else "-"
        serie = cp.get("serie_label") or "-"
        if r:
            situacao = "Conforme" if r.get("conforme") else "Não conforme"
            if r.get("validacao_status") == "Rejeitado":
                situacao = "Rejeitado"
            tdata.append([cp["identificacao"], serie, f"{r['idade_real']}d", molda, r["data_ensaio"][:10],
                          f"{r['diametro']:.0f}", f"{r['area_cm2']:.2f}", f"{r['carga_kn']:.1f}",
                          f"{r['resistencia_mpa']:.2f}", f"{cp.get('fck_nominal','-')}", situacao])
        else:
            tdata.append([cp["identificacao"], serie, f"{cp['idade']}d", molda, prev,
                          "-", "-", "-", "Pendente", f"{cp.get('fck_nominal','-')}", "-"])
    t = Table(tdata, colWidths=[1.8*cm, 1.3*cm, 1.1*cm, 1.9*cm, 1.9*cm, 1.4*cm, 1.4*cm, 1.4*cm, 1.3*cm, 1.1*cm, 1.9*cm])
    ts = TableStyle([
        ('BACKGROUND', (0,0), (-1,0), rl_colors.HexColor("#0f172a")),
        ('TEXTCOLOR', (0,0), (-1,0), rl_colors.white),
        ('FONTSIZE', (0,0), (-1,-1), 7.5),
        ('GRID', (0,0), (-1,-1), 0.25, rl_colors.HexColor("#cbd5e1")),
        ('ALIGN', (1,1), (-1,-1), 'CENTER'),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [rl_colors.white, rl_colors.HexColor("#f8fafc")]),
    ])
    # Colorir coluna "Situação"
    for i, row in enumerate(tdata[1:], start=1):
        sit = row[-1]
        if sit == "Conforme":
            ts.add('TEXTCOLOR', (-1, i), (-1, i), rl_colors.HexColor("#166534"))
        elif sit in ("Não conforme", "Rejeitado"):
            ts.add('TEXTCOLOR', (-1, i), (-1, i), rl_colors.HexColor("#b91c1c"))
    t.setStyle(ts)
    story.append(t)

    story.append(Spacer(1, 12))
    story.append(Paragraph(
        "Observações: Resultados apresentados conforme moldagem e ruptura registradas no sistema LabControl. "
        "Os critérios de aceitação (aprovação/reprovação) devem ser configurados conforme normas aplicáveis (NBR 5738 / NBR 5739).",
        normal
    ))
    story.append(Spacer(1, 24))
    # Bloco de assinaturas com CREA + data
    signatures = []
    tecnico_validador = None
    # Buscar o último tecnico que validou alguma ruptura desta obra
    for r in rupturas:
        if r.get("validado_por"):
            u = await db.users.find_one({"id": r["validado_por"]}, {"_id": 0, "password_hash": 0})
            if u:
                tecnico_validador = u
                break
    data_str = now_utc().strftime("%d/%m/%Y")
    laborista_line = f"<b>{user.get('name','')}</b><br/>Responsável pelo ensaio<br/>{('CREA: ' + user.get('crea','')) if user.get('crea') else ''}<br/>Data: {data_str}"
    if tecnico_validador and tecnico_validador.get("id") != user.get("id"):
        tec_line = f"<b>{tecnico_validador.get('name','')}</b><br/>Técnico de Qualidade / Validador<br/>{('CREA: ' + tecnico_validador.get('crea','')) if tecnico_validador.get('crea') else ''}<br/>Data: {data_str}"
        sig_table = Table([
            ["_________________________", "_________________________"],
            [Paragraph(laborista_line, normal), Paragraph(tec_line, normal)],
        ], colWidths=[8.5*cm, 8.5*cm])
        sig_table.setStyle(TableStyle([
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('TOPPADDING', (0,1), (-1,1), 4),
        ]))
        story.append(sig_table)
    else:
        # Só o responsável (super_admin ou tecnico já é o gerador)
        role_label = "Técnico Responsável" if user.get("role") in ("tecnico", "super_admin") else "Responsável pelo Ensaio"
        crea_l = f"CREA: {user.get('crea','')}" if user.get('crea') else ""
        story.append(Paragraph(f"_____________________________________<br/><b>{user.get('name','')}</b><br/>{role_label}<br/>{crea_l}<br/>Data: {data_str}", normal))

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

    # Migration: backfill serie_label for existing concretos and CPs
    async for c in db.concretos.find({"$or": [{"serie_label": {"$exists": False}}, {"serie_label": None}]}):
        prev = await db.concretos.count_documents({
            "obra_id": c["obra_id"], "company_id": c["company_id"],
            "created_at": {"$lt": c.get("created_at", "")}
        })
        serie_num = prev + 1
        await db.concretos.update_one({"id": c["id"]}, {"$set": {
            "serie_numero": serie_num,
            "serie_label": f"S-{serie_num:03d}",
        }})
    async for cp in db.corpos_prova.find({"$or": [{"serie_label": {"$exists": False}}, {"serie_label": None}]}):
        concreto = await db.concretos.find_one({"id": cp["concreto_id"]})
        if concreto and concreto.get("serie_label"):
            await db.corpos_prova.update_one({"id": cp["id"]}, {"$set": {
                "serie_label": concreto["serie_label"],
                "serie_numero": concreto.get("serie_numero"),
                "nota_fiscal": concreto.get("nota", ""),
            }})

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

    # Demo user (laboratorista - lança ensaios)
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

    # Laboratorista (lança ensaios, não pode validar)
    lab_email = "laboratorista@labcontrol.com"
    if not await db.users.find_one({"email": lab_email}):
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": lab_email,
            "password_hash": hash_password("lab123"),
            "name": "Carlos Souza",
            "role": "laboratorista",
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
        # Concreto para obra1 - com série 001
        moldagem = now_utc() - timedelta(days=5)
        concreto_id = str(uuid.uuid4())
        await db.concretos.insert_one({
            "id": concreto_id, "company_id": demo_company["id"], "obra_id": obra1_id,
            "obra_nome": "Residencial Jardim das Acácias",
            "data_hora": iso(moldagem), "fornecedor": "Cimento Votorantim", "nota": "NF-4587",
            "fck": 30.0, "volume": 8.0, "elemento": "Pilar P12", "slump": 120.0,
            "observacoes": "Concreto bombeado - Traço 1:2:3",
            "serie_numero": 1, "serie_label": "S-001",
            "created_at": iso(now_utc()), "created_by": "",
        })
        # 4 CPs com identificação S-001-A/B/C/D (2 x 7d, 2 x 28d)
        letters = "ABCD"
        li = 0
        for idade in [7, 28]:
            for _ in range(2):
                await db.corpos_prova.insert_one({
                    "id": str(uuid.uuid4()), "company_id": demo_company["id"],
                    "obra_id": obra1_id, "obra_nome": "Residencial Jardim das Acácias",
                    "concreto_id": concreto_id,
                    "serie_label": "S-001", "serie_numero": 1,
                    "identificacao": f"S-001-{letters[li]}",
                    "data_moldagem": iso(moldagem), "idade": idade,
                    "data_prevista_ruptura": iso(moldagem + timedelta(days=idade)),
                    "status": "Pendente", "observacoes": "", "fck_nominal": 30.0,
                    "nota_fiscal": "NF-4587",
                    "created_at": iso(now_utc()),
                })
                li += 1
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

## Técnico de Qualidade (valida rupturas)
- Email: `tecnico@labcontrol.com`
- Password: `tecnico123`
- Role: tecnico
- Company: LabControl Demo

## Laboratorista (lança ensaios, NÃO valida)
- Email: `laboratorista@labcontrol.com`
- Password: `lab123`
- Role: laboratorista
- Company: LabControl Demo

## Auth Endpoints
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me
- POST /api/auth/forgot-password
- POST /api/auth/reset-password
- PUT /api/rupturas/{{id}}/validar (tecnico only)
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
