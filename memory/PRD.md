# LabControl - PRD

## Problem Statement
SaaS para laboratórios de controle tecnológico de solos e concreto e empresas de engenharia.
Fluxo V1: OBRA → CONCRETO → CORPOS DE PROVA → RUPTURA → RELATÓRIO PDF.

## Architecture
- Backend: FastAPI + Motor (MongoDB async) + JWT (bcrypt) + ReportLab
- Frontend: React 19 + TailwindCSS + shadcn/ui + react-router 7
- Multi-tenant via company_id em todos documentos
- Roles: super_admin (cria empresas), company_admin, tecnico

## Personas
- Super Admin (edesioalexandre13@gmail.com): provisiona empresas
- Administrador de Laboratório: gerencia obras, equipe, relatórios
- Técnico de Laboratório: registra concretos, molda CPs, executa rupturas

## Implemented (2026-02)
- Auth JWT (login, logout, me, forgot-password c/ token, reset-password)
- Multi-tenancy: super_admin cria empresas via /api/companies
- Dashboard: 5 KPIs + obras recentes + próximos vencimentos
- CRUD Obras (nome, cliente, endereço, responsável, status)
- CRUD Concreto (obra, data, fornecedor, FCK, volume, elemento, slump)
- CPs em batch (geração automática 7/28 dias, qtde configurável)
- Ruptura com cálculo MPa = (Carga × 10) / Área
- CRUD Equipamentos com status calibração (Em dia / Próxima / Vencido)
- Relatório PDF de obra (ReportLab)
- Seed: empresa demo + admin + técnico + 2 obras + 1 concreto + 4 CPs + 3 equipamentos

## Backlog
### P0 (próximas melhorias)
- Recuperação de senha via e-mail real (Resend)
- Filtros de data no dashboard

### P1
- Módulo Solos (compactação, CBR, granulometria, PDL)
- Configuração de critérios de aceitação (aprovação/reprovação FCK)
- Upload de certificados de calibração
- Convite de usuários por link

### P2
- Controle de aterros
- Relatórios PDF para CPs individuais e equipamentos
- Gráficos de evolução de resistência
- Notificações por e-mail de calibrações vencendo
