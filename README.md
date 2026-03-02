# AltraIA

Plataforma **multi-tenant** e **multi-agente** para criação e gestão de assistentes virtuais de IA. Cada empresa (tenant) pode ter múltiplos agentes configurados com prompt, modelo, temperatura, ferramentas e regras de roteamento. O canal de produção é WhatsApp (via webhook), e o painel web administra empresas, agentes e testa conversas em tempo real.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js 18+, TypeScript, Express |
| AI | OpenRouter (API compatível com OpenAI) — modelos como `google/gemini-2.0-flash-001` |
| Persistência | Drizzle ORM + SQLite (dev) / Postgres (`POSTGRES_URL`) |
| Sessões/cache | In-memory (dev) ou Redis — Vercel KV/Upstash via `KV_REST_API_URL` |
| Frontend (painel) | Vite, React 18, Tailwind CSS |
| Deploy | Vercel (serverless via `api/index.ts`) |
| Testes | Jest, ts-jest, supertest |

## Estrutura do projeto

```
AltraIA/
├── api/
│   └── index.ts              # Serverless entry-point (Vercel)
├── src/
│   ├── mock/                 # Servidor Express principal
│   │   ├── server.ts         # Entrada: rotas chat, webhook, admin
│   │   ├── adminRouter.ts    # CRUD de tenants, agentes e tools
│   │   ├── v1Router.ts       # Rotas mock /v1/* (ERP simulado)
│   │   ├── sessionStore.ts   # Abstração de sessão (memória / Redis)
│   │   ├── tenantStorage.ts  # Leitura/escrita de configs de tenant
│   │   ├── executionStore.ts # Store de execuções (memória / DB)
│   │   └── usageStore.ts     # Rastreamento de consumo
│   ├── core/
│   │   ├── ai/
│   │   │   ├── provider.ts   # Loop de tool-calling com OpenRouter
│   │   │   ├── tools.ts      # Tools built-in + execução de tools custom
│   │   │   ├── intent.ts     # Detecção de intenção (regex/keywords)
│   │   │   └── order-flow.ts # State machine do fluxo de pedido
│   │   ├── chat/
│   │   │   └── processChat.ts # Orquestração principal (tenant, agente, sessão, IA)
│   │   └── utils/            # Formatação, helpers de documento
│   ├── config/
│   │   ├── tenant.ts         # Interfaces e lógica de config de tenant
│   │   └── agentTemplates.ts # Templates prontos de agente
│   └── db/
│       ├── client.ts         # Conexão Drizzle (SQLite/Postgres)
│       ├── schema.ts         # Tabelas: tenants, execuções, usage
│       └── repositories/     # tenantRepository, executionRepository, usageRepository
├── simulator/                # Painel web (Vite + React + Tailwind)
│   └── src/
│       ├── pages/
│       │   ├── empresas/     # Listagem, empresa, agentes, tools, histórico
│       │   ├── admin/        # Admin gate + painel legado
│       │   ├── ChatPage.tsx  # Preview do chat
│       │   └── PublicChatPage.tsx # Link público /t/:tenantId
│       └── context/          # TenantContext, ThemeContext
├── config/
│   ├── tenant.example.json   # Exemplo de config de tenant
│   └── tenants/              # Config por empresa (JSON)
├── drizzle/
│   └── 0000_initial.sql      # Migration inicial
├── scripts/                  # Utilitários de deploy e migração
├── .env.example
└── package.json
```

## Pré-requisitos

- Node.js 18+
- Chave de API no [OpenRouter](https://openrouter.ai)

## Como rodar

### 1. Variáveis de ambiente

```bash
cp .env.example .env.local
```

Edite `.env.local` com no mínimo:

```dotenv
OPENROUTER_API_KEY=sk-or-v1-...               # obrigatório
OPENROUTER_MODEL=google/gemini-2.0-flash-001  # padrão
ADMIN_API_KEY=sk_live_...                     # chave para o painel admin
PORT=3001

# Opcional: Postgres (sem isso usa SQLite local)
POSTGRES_URL=postgresql://...

# Opcional: Redis para sessões compartilhadas
KV_REST_API_URL=https://...
KV_REST_API_TOKEN=...
```

### 2. Backend

```bash
npm install
npm run dev        # sobe em http://localhost:3001
```

### 3. Painel web (simulador)

```bash
cd simulator
npm install
npm run dev        # sobe em http://localhost:5173
```

Acesse `http://localhost:5173/empresas` para gerenciar empresas e agentes.

---

## Conceitos principais

### Empresas (Tenants)

Cada empresa tem um `tenantId` único (slug, ex.: `Docedavovo`). Configurações armazenadas em `config/tenants/{tenantId}.json` ou no banco Postgres.

### Agentes

Cada agente dentro de uma empresa possui:

| Campo | Descrição |
|-------|-----------|
| `id` | Slug único dentro da empresa |
| `name` | Nome exibido ao usuário |
| `systemPrompt` | Prompt de sistema (texto ou path de arquivo .md) |
| `model` | Modelo OpenRouter (ex: `google/gemini-2.0-flash-001`) |
| `temperature` | 0–2, controla criatividade |
| `api.mode` | `disabled` / `production` / `mock` |
| `toolIds` | IDs das tools que o agente pode usar |
| `handoffRules` | Regras de transferência para outros agentes |

### Modos de integração (`api.mode`)

- **Desativada** — IA responde livremente sem chamar APIs externas.
- **Mock** — usa dados fictícios em memória (sem ERP real). Ideal para testes e demos.
- **Produção** — chama a API real do ERP do cliente (`api.baseUrl`).

### Ferramentas (Tools)

**Built-in** (disponíveis em todas as empresas):

| Tool | Função |
|------|--------|
| `consultar_cliente` | Verifica existência e dados cadastrais |
| `consultar_titulos` | Lista boletos/títulos financeiros |
| `consultar_pedidos` | Histórico de pedidos e links de NF-e/DANFE |
| `consultar_estoque` | Preço e disponibilidade de produtos |

**Custom:** qualquer empresa pode criar tools HTTP (GET/POST) via painel. O LLM pode chamá-las igualmente.

### Roteamento entre agentes (Handoff)

Quando `handoffRules.enabled = true`, o agente pode usar a tool `transferir_para_agente` para transferir a conversa para outro agente da mesma empresa. A sessão continua sem o usuário repetir o contexto.

### Fluxo do chat público

`/t/:tenantId` — abre o chat no agente de entrada definido em `chatFlow.entryAgentId`.  
`/t/:tenantId/:agentId` — abre direto em um agente específico.

---

## Painel web — Rotas

| Rota | Descrição |
|------|-----------|
| `/empresas` | Lista de empresas cadastradas |
| `/empresas/:id` | Agentes da empresa |
| `/empresas/:id/edit` | Editar empresa (nome, fluxo de chat, escalação humana) |
| `/empresas/:id/tools` | Ferramentas da empresa (listar, criar, testar) |
| `/empresas/:id/preview` | Chat preview geral (usa fluxo de entrada) |
| `/empresas/:id/agents/new` | Criar novo agente (a partir de templates) |
| `/empresas/:id/agents/:agentId` | Detalhe do agente (8 abas: Configurações, Chat, Histórico, Execuções, Webhook, Consumo, Links, Roteamento) |
| `/t/:tenantId` | Chat público da empresa |

---

## API REST principal

### Chat

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/chat` | Envia mensagem; headers `X-Tenant-Id`, `X-Assistant-Id` (opcional) |
| `POST` | `/webhook/messages` | Webhook de mensageria (WhatsApp etc.) |
| `GET` | `/api/config` | Retorna config pública do tenant (nome, saudação, agente de entrada) |

### Admin (requer `X-Admin-Key`)

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/admin/tenants` | Lista tenants |
| `GET/POST` | `/api/admin/tenants/:id` | Detalhe / Cria tenant |
| `PATCH/DELETE` | `/api/admin/tenants/:id` | Atualiza / Remove tenant |
| `GET/POST` | `/api/admin/tenants/:id/tools` | Lista / Cria tool |
| `PATCH/DELETE` | `/api/admin/tenants/:id/tools/:toolId` | Atualiza / Remove tool |
| `POST` | `/api/admin/tenants/:id/tools/:toolId/test` | Testa tool com `{ args }` |
| `GET` | `/api/admin/executions` | Lista execuções (filtro por tenant, phone) |
| `GET` | `/api/admin/conversations` | Lista conversas únicas por sessão |
| `GET` | `/api/admin/usage` | Consumo por tenant/agente |

---

## Produção — WhatsApp

1. Configure na plataforma de mensageria a URL de webhook: `https://<seu-backend>/webhook/messages`
2. Defina `SOUCHAT_WEBHOOK_SECRET` no `.env` para validação de assinatura.
3. O endpoint aceita no body: `phone` (ou `from`/`sender_id`) e `message` (ou `text`/`content`).

---

## Testes

```bash
npm run test              # roda todos os testes
npm run test:watch        # modo watch
npm run test:coverage     # cobertura
```

---

## Scripts principais

| Script | Descrição |
|--------|-----------|
| `npm run dev` | Sobe backend em modo dev (`ts-node`) na porta 3001 |
| `npm run build` | Compila TypeScript |
| `npm run db:migrate` | Aplica migrations SQL no Postgres |
| `npm run db:migrate:json` | Migra configs JSON → Postgres |
| `npm run vercel:deploy:ci` | Pipeline CI: bootstrap + migrate + deploy Vercel |
| `npm run test` | Roda Jest |
