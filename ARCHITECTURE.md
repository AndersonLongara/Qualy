# Arquitetura — AltraIA

## 1. Visão Geral

AltraIA é uma plataforma multi-tenant e multi-agente. Cada empresa (tenant) tem sua própria configuração, conjunto de agentes e isolamento de sessão. O backend é um servidor Express que pode rodar localmente ou como função serverless na Vercel.

```
┌─────────────────────────────────────────────────────────────┐
│                          Clientes                           │
│   WhatsApp (webhook)    │   Painel Web (Vite/React)         │
└─────────┬───────────────────────────┬───────────────────────┘
          │                           │
          ▼                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Express / Vercel                         │
│  POST /webhook/messages    │  REST /api/admin/*             │
│  POST /api/chat            │  GET  /api/config              │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                  processChat (core)                         │
│  1. Resolve tenant + agente (config)                        │
│  2. Carrega sessão (sessionStore)                           │
│  3. Detecta intent                                          │
│  4. Order-flow OU LLM (provider + tools)                    │
│  5. Handoff se necessário (transferir_para_agente)          │
│  6. Persiste execução + atualiza sessão                     │
└───────────┬──────────────────────┬──────────────────────────┘
            │                      │
            ▼                      ▼
   ┌─────────────────┐   ┌──────────────────────┐
   │  OpenRouter     │   │   API do ERP         │
   │  (LLM)          │   │   (mode: production) │
   │  Gemini/GPT/... │   │   ou mock em memória │
   └─────────────────┘   └──────────────────────┘
            │
            ▼
   ┌─────────────────┐   ┌──────────────────────┐
   │  SQLite/Postgres│   │  Redis / Vercel KV   │
   │  (execuções,    │   │  (sessões e agente   │
   │   tenants,      │   │   corrente por phone)│
   │   usage)        │   └──────────────────────┘
   └─────────────────┘
```

---

## 2. Camadas

### 2.1 Canal de entrada

| Canal | Endpoint | Descrição |
|-------|----------|-----------|
| WhatsApp (SouChat/outros) | `POST /webhook/messages` | Recebe mensagem + phone, retorna reply |
| Painel web (Chat preview) | `POST /api/chat` | Headers: `X-Tenant-Id`, `X-Assistant-Id` |
| Link público | `GET /t/:tenantId/:agentId` → frontend → `POST /api/chat` | Acesso sem autenticação |

### 2.2 Orquestrador de chat (`processChat`)

Responsável por:

1. **Resolver configuração** — carrega `TenantConfig` e `AssistantConfig` do tenant/agente corretos.
2. **Sessão** — lê e escreve estado da conversa via `sessionStore` (in-memory ou Redis).
3. **Intent detection** — classifica a mensagem antes de chamar o LLM (saudação, escalação humana, etc.).
4. **Order-flow** — state machine para confirmação de pedidos (quando `orderFlowEnabled`).
5. **LLM + tool-calling** — chama o `provider` (OpenRouter) com as tools disponíveis para o agente.
6. **Handoff** — se o LLM chamar `transferir_para_agente`, atualiza o agente corrente na sessão e reprocessa.
7. **Persistência** — salva execução (status, duração, debug) e atualiza consumo.

### 2.3 Ferramentas (Tools)

```
tools.ts
├── Built-in (sempre disponíveis)
│   ├── consultar_cliente      → GET /v1/clientes?doc=...
│   ├── consultar_titulos      → GET /v1/financeiro/titulos?doc=...
│   ├── consultar_pedidos      → GET /v1/faturamento/pedidos?doc=...
│   └── consultar_estoque      → GET /v1/vendas/estoque
├── transferir_para_agente     → handoff interno (não chama API externa)
└── Tools custom (por tenant)  → HTTP GET/POST configurado no painel
```

O agente decide quais tools chamar com base no `toolIds` configurado. Se nenhuma tool for selecionada, o sistema usa o comportamento padrão (todas as built-in habilitadas pelo `features`).

### 2.4 Configuração de tenant

Cada tenant é um arquivo JSON em `config/tenants/{tenantId}.json` (ou linha no banco Postgres). A estrutura principal:

```json
{
  "branding": { "companyName": "...", "assistantName": "..." },
  "assistants": [
    {
      "id": "Atendente",
      "name": "Nona",
      "systemPrompt": "...",
      "model": "google/gemini-2.0-flash-001",
      "temperature": 0.8,
      "api": { "mode": "mock" },
      "toolIds": ["consultar_estoque", "transferir_para_agente"],
      "handoffRules": {
        "enabled": true,
        "routes": [{ "agentId": "Vendedor", "label": "Vendedor", "description": "Transferir quando cliente quer fazer pedido" }]
      }
    }
  ],
  "tools": [ /* tools custom do tenant */ ],
  "chatFlow": {
    "entryAgentId": "Atendente",
    "humanEscalation": { "enabled": true, "message": "...", "webhookUrl": "..." }
  }
}
```

### 2.5 Persistência

| Dado | Storage (dev) | Storage (prod) |
|------|--------------|----------------|
| Configs de tenant | Arquivos JSON | Postgres (tabela `tenants`) |
| Sessões de conversa | In-memory | Redis / Vercel KV |
| Agente corrente por phone | In-memory | Redis / Vercel KV |
| Execuções | In-memory | Postgres (tabela `executions`) |
| Consumo (usage) | In-memory | Postgres (tabela `usage`) |

### 2.6 Deploy (Vercel)

`api/index.ts` exporta o app Express como handler serverless. A Vercel cuida de escalonamento automático. Persistência requer `POSTGRES_URL` e `KV_REST_API_URL` configurados no projeto Vercel.

---

## 3. Fluxo de uma mensagem (sequência)

```
Usuário → Webhook → processChat
  │
  ├── getConfig(tenantId)            # config da empresa e agente
  ├── currentAgentStore.get()        # agente corrente da sessão (handoff)
  ├── sessionStore.get()             # histórico de mensagens
  ├── detectIntent(message)          # saudação? escalação humana?
  │
  ├── [se order-flow ativo]
  │   └── processOrderFlow()         # state machine de pedido
  │
  └── [caso geral] callLLM()
        ├── monta system prompt do agente
        ├── inclui histórico de sessão
        ├── disponibiliza tools para o LLM
        └── loop de tool-calling:
              ├── LLM escolhe tool → executa → retorna resultado
              └── repete até LLM gerar resposta final
                   └── [se transferir_para_agente]
                         └── atualiza agente corrente → recursão
```

---

## 4. Segurança

| Aspecto | Implementação |
|---------|--------------|
| Admin API | Header `X-Admin-Key` ou `Authorization: Bearer` com `ADMIN_API_KEY` |
| Webhook | Validação de assinatura via `SOUCHAT_WEBHOOK_SECRET` (HMAC) |
| Dados sensíveis | CPF/CNPJ mascarados nos logs |
| Rate limit | Por telefone (implementação pendente — ver Onda 2) |
| Sessão | TTL automático; dados isolados por `(tenantId, phone, agentId)` |

---

## 5. Observabilidade

- **Execuções:** toda mensagem gera um registro com `status`, `durationMs`, `source`, campo `debug` (handoff, tool calls).
- **Histórico:** conversas agrupadas por sessão `(tenantId, phone)` com timeline de transferências.
- **Consumo:** tokens e chamadas por tenant/agente para rastrear custo.
- **Logs:** console estruturado no servidor; erros com stack trace.
