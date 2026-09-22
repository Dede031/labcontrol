"""LabControl Iteration 2 backend tests: RBAC, séries auto, validação, solos, PDF, vencidos_only."""
import os
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://soil-lab-preview.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("edesioalexandre13@gmail.com", "admin123")
TECNICO = ("tecnico@labcontrol.com", "tecnico123")
LAB = ("laboratorista@labcontrol.com", "lab123")


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    return r.json()["access_token"], r.json()


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_tok():
    tok, u = _login(*ADMIN)
    return tok, u


@pytest.fixture(scope="module")
def tec_tok():
    tok, u = _login(*TECNICO)
    return tok, u


@pytest.fixture(scope="module")
def lab_tok():
    tok, u = _login(*LAB)
    return tok, u


# --------------- Auth & roles ---------------
class TestAuthRoles:
    def test_laboratorista_login_and_role(self, lab_tok):
        tok, u = lab_tok
        assert u["role"] == "laboratorista"
        assert u.get("company_id")

    def test_tecnico_role(self, tec_tok):
        _, u = tec_tok
        assert u["role"] == "tecnico"


# --------------- Series auto + concreto/CPs ---------------
@pytest.fixture(scope="module")
def obra_for_tests(admin_tok):
    tok, _ = admin_tok
    payload = {"nome": "TEST_Obra_Iter2", "cliente": "TEST_Cli", "endereco": "R X", "cidade": "Itabira", "uf": "MG",
               "responsavel": "TEST", "status": "Ativa", "observacoes": ""}
    r = requests.post(f"{API}/obras", json=payload, headers=_h(tok), timeout=30)
    assert r.status_code == 200, r.text
    obra = r.json()
    yield obra
    # teardown
    requests.delete(f"{API}/obras/{obra['id']}", headers=_h(tok), timeout=30)


class TestSeriesAuto:
    def test_two_concretos_sequential(self, admin_tok, obra_for_tests):
        tok, _ = admin_tok
        base = {"obra_id": obra_for_tests["id"], "data_hora": "2026-01-15T10:00:00Z",
                "fornecedor": "TEST", "nota": "NF-1", "fck": 30.0, "volume": 5.0,
                "elemento": "Pilar", "slump": 100.0, "observacoes": ""}
        r1 = requests.post(f"{API}/concretos", json=base, headers=_h(tok), timeout=30)
        assert r1.status_code == 200, r1.text
        c1 = r1.json()
        assert c1["serie_label"].startswith("S-")
        n1 = c1["serie_numero"]

        base["nota"] = "NF-2"
        r2 = requests.post(f"{API}/concretos", json=base, headers=_h(tok), timeout=30)
        assert r2.status_code == 200
        c2 = r2.json()
        assert c2["serie_numero"] == n1 + 1
        assert c2["serie_label"] == f"S-{n1+1:03d}"
        pytest.concreto_a = c1
        pytest.concreto_b = c2

    def test_cps_batch_uses_serie(self, admin_tok):
        tok, _ = admin_tok
        c = pytest.concreto_a
        payload = {"concreto_id": c["id"], "quantidade": 2, "data_moldagem": "2026-01-15T10:00:00Z",
                   "idades": [7, 28], "observacoes": ""}
        r = requests.post(f"{API}/cps/batch", json=payload, headers=_h(tok), timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 4
        expected_prefix = c["serie_label"] + "-"
        idents = [x["identificacao"] for x in data["created"]]
        assert all(i.startswith(expected_prefix) for i in idents), idents
        letters = sorted([i.split("-")[-1] for i in idents])
        assert letters == ["A", "B", "C", "D"]
        pytest.cps_batch = data["created"]


# --------------- Ruptura conforme / validação RBAC ---------------
class TestRupturaValidacao:
    def test_ruptura_conforme_true(self, admin_tok):
        tok, _ = admin_tok
        cp = pytest.cps_batch[0]
        # fck=30, use carga high -> resistencia >= 30
        r = requests.post(f"{API}/rupturas",
                          json={"cp_id": cp["id"], "idade_real": 7, "diametro": 100.0, "carga": 250.0},
                          headers=_h(tok), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["conforme"] is True
        assert d["resistencia_mpa"] >= 30
        assert d["validacao_status"] == "Aguardando validação"
        pytest.rupt_conforme = d

    def test_ruptura_conforme_false(self, admin_tok):
        tok, _ = admin_tok
        cp = pytest.cps_batch[1]
        r = requests.post(f"{API}/rupturas",
                          json={"cp_id": cp["id"], "idade_real": 7, "diametro": 100.0, "carga": 100.0},
                          headers=_h(tok), timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["conforme"] is False
        pytest.rupt_nao = d

    def test_lab_cannot_validate(self, lab_tok):
        tok, _ = lab_tok
        r = requests.put(f"{API}/rupturas/{pytest.rupt_conforme['id']}/validar",
                         json={"aprovado": True, "observacoes": ""},
                         headers=_h(tok), timeout=30)
        assert r.status_code == 403

    def test_tecnico_validate_approve(self, tec_tok):
        tok, _ = tec_tok
        r = requests.put(f"{API}/rupturas/{pytest.rupt_conforme['id']}/validar",
                         json={"aprovado": True, "observacoes": "ok"},
                         headers=_h(tok), timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "Validado"

    def test_tecnico_validate_reject(self, tec_tok):
        tok, _ = tec_tok
        r = requests.put(f"{API}/rupturas/{pytest.rupt_nao['id']}/validar",
                         json={"aprovado": False, "observacoes": "reprovada"},
                         headers=_h(tok), timeout=30)
        assert r.status_code == 200
        assert r.json()["status"] == "Rejeitado"


# --------------- vencidos_only filter ---------------
class TestVencidosOnly:
    def test_vencidos_only_returns_pending_expired(self, admin_tok):
        tok, _ = admin_tok
        r = requests.get(f"{API}/cps?vencidos_only=true", headers=_h(tok), timeout=30)
        assert r.status_code == 200
        items = r.json()
        now = datetime.now(timezone.utc)
        for x in items:
            assert x["status"] == "Pendente"
            dt = datetime.fromisoformat(x["data_prevista_ruptura"].replace("Z", "+00:00"))
            assert dt <= now


# --------------- Solos ---------------
@pytest.fixture(scope="module")
def amostra(admin_tok, obra_for_tests):
    tok, _ = admin_tok
    r = requests.post(f"{API}/solos/amostras",
                      json={"obra_id": obra_for_tests["id"], "identificacao": "TEST_AM-01",
                            "local": "Aterro A", "profundidade": "0.5m", "descricao": "silte arenoso",
                            "observacoes": ""},
                      headers=_h(tok), timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


class TestSolos:
    def test_amostra_created_scoped(self, amostra, admin_tok):
        tok, u = admin_tok
        assert amostra["company_id"] == u["company_id"]
        assert amostra["identificacao"] == "TEST_AM-01"

    def test_pdl(self, admin_tok, amostra):
        tok, _ = admin_tok
        r = requests.post(f"{API}/solos/pdl",
                          json={"amostra_id": amostra["id"], "data_ensaio": "2026-01-15",
                                "operador": "TEST", "pontos": [
                                    {"profundidade_cm": 10, "golpes": 5},
                                    {"profundidade_cm": 20, "golpes": 8}]},
                          headers=_h(tok), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert len(d["pontos"]) == 2

    def test_compactacao_parabolic(self, admin_tok, amostra):
        tok, _ = admin_tok
        pts = [
            {"umidade": 8, "densidade_seca": 1.72},
            {"umidade": 10, "densidade_seca": 1.79},
            {"umidade": 12, "densidade_seca": 1.83},
            {"umidade": 14, "densidade_seca": 1.80},
            {"umidade": 16, "densidade_seca": 1.74},
        ]
        r = requests.post(f"{API}/solos/compactacao",
                          json={"amostra_id": amostra["id"], "data_ensaio": "2026-01-15",
                                "energia": "Normal", "pontos": pts},
                          headers=_h(tok), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["umidade_otima"] is not None
        assert 11.0 <= d["umidade_otima"] <= 13.0, f"umidade_otima={d['umidade_otima']}"
        assert 1.80 <= d["densidade_max"] <= 1.90

    def test_hilf(self, admin_tok, amostra):
        tok, _ = admin_tok
        # d_seca_campo = 1.90/(1+0.10) ~1.727; gc = 1.727/1.83*100 ~ 94.4 -> not conforme (meta 95)
        r = requests.post(f"{API}/solos/hilf",
                          json={"amostra_id": amostra["id"], "data_ensaio": "2026-01-15",
                                "umidade_campo": 10.0, "densidade_campo": 1.90,
                                "densidade_max_lab": 1.83, "umidade_otima_lab": 12.0,
                                "grau_compactacao_meta": 95.0},
                          headers=_h(tok), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert 90 <= d["grau_compactacao"] <= 100
        # conforme flag depends on threshold
        assert isinstance(d["conforme"], bool)


# --------------- PDF ---------------
class TestPDF:
    def test_pdf_contains_pdf_bytes(self, admin_tok, obra_for_tests):
        tok, _ = admin_tok
        r = requests.get(f"{API}/relatorios/obra/{obra_for_tests['id']}", headers=_h(tok), timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"
