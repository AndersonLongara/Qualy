# PRD — AltraIA: Plataforma Multi-Tenant de Agentes de IA

## 1. Visão Geral

**AltraIA** é uma plataforma SaaS para criação, configuração e operação de assistentes virtuais de IA por WhatsApp. Focada em empresas B2B que precisam automatizar atendimento com dados do próprio ERP, a plataforma permite que cada empresa tenha múltiplos agentes especializados (atendimento, comercial, financeiro, SAC) com roteamento inteligente entre eles.

**Proposta de valor:** configurar um agente de IA funcional, conectado ao ERP, em minutos — sem código.

---

## 2. Estado Atual (v1 — MVP funcional)

### Funcionalidades entregues

| Funcionalidade | Status |
|----------------|--------|
| Multi-tenant com CRUD de empresas (painel + API) | ✅ |
| Multi-agente por empresa (criar, editar, excluir) | ✅ |
| Configuração de agente: prompt, modelo, temperatura | ✅ |
| Modos de integração: Desativada / Mock / Produção | ✅ |
| Tools built-in: cliente, títulos, pedidos, estoque | ✅ |
| Tools custom (HTTP GET/POST) via painel | ✅ |
| Teste de tools diretamente no painel | ✅ |
| Vínculo de tools por agente | ✅ |
| Roteamento entre agentes (handoff / cadeia de agentes) | ✅ |
| Agente de entrada por empresa (chatFlow.entryAgentId) | ✅ |
| Escalação para atendente humano (webhook + mensagem) | ✅ |
| Chat preview por agente (painel admin) | ✅ |
| Chat preview geral (usando fluxo de entrada) | ✅ |
| Link público: `/t/:tenantId` e `/t/:tenantId/:agentId` | ✅ |
| Histórico de conversas por sessão (timeline) | ✅ |
| Execuções com status, duração, origem, debug | ✅ |
| Rastreamento de consumo (tokens/chamadas) por agente | ✅ |
| Webhook de entrada (WhatsApp / SouChat) | ✅ |
| Configuração de webhook por agente | ✅ |
| Persistência: JSON (dev) ou Postgres via Drizzle ORM | ✅ |
| Sessões: in-memory (dev) ou Redis (Vercel KV) | ✅ |
| Deploy serverless na Vercel | ✅ |
| Templates de agente (atendimento, vendas, SAC, etc.) | ✅ |
| Painel admin protegido por ADMIN_API_KEY | ✅ |
| Tema claro/escuro no painel | ✅ |
| Incrementar/Refinar prompt com IA | ✅ |

---

## 3. Indicadores de Sucesso (KPIs)

| Indicador | Meta |
|-----------|------|
| Taxa de deflexão | > 70% dos atendimentos resolvidos sem humano |
| TMA (Tempo Médio) | < 90s até resolução |
| Taxa de erro de integração | < 2% das chamadas |
| Taxa de conversão (consulta → pedido) | Meta por empresa |
| Uptime da API | > 99,5% |
| Tempo de configuração de novo agente | < 10 minutos |

---

## 4. Roadmap de Evoluções

### 🌊 Onda 2 — Gestão Operacional (próximas prioridades)

| Funcionalidade | Descrição |
|----------------|-----------|
| Dashboard de métricas | Gráficos de volume, deflexão, duração, erros por empresa/agente |
| Busca e filtros avançados no histórico | Filtrar por data, status, agente, conteúdo |
| Exportar execuções (CSV/JSON) | Para análise externa |
| Alertas de erros de integração | Notificação quando tool falha repetidamente |
| Controle de rate limit por telefone | Proteger contra abuso |
| Autenticação de usuário no painel | Login real (substituir ADMIN_API_KEY por sessão autenticada) |

### 🌊 Onda 3 — Expansão de Canais e Automações

| Funcionalidade | Descrição |
|----------------|-----------|
| Suporte a múltiplos canais | Instagram DM, Telegram, widget web |
| Notificações proativas | Boletos a vencer, status de pedido, cobranças |
| Agendamento de mensagens | Envio programado ou gatilho por evento |
| OTP / Autenticação do cliente | Código de verificação para operações sensíveis |
| Gestão de contatos / CRM light | Lista de clientes atendidos com histórico |
| Marketplace de templates | Templates de agente compartilháveis entre empresas |

### 🌊 Onda 4 — Plataforma SaaS Completa

| Funcionalidade | Descrição |
|----------------|-----------|
| Planos e billing | Cobrança por mensagem ou por empresa (Stripe) |
| Onboarding guiado | Wizard para criar empresa + agente em 5 passos |
| Multi-usuário por empresa | Cada empresa tem seus próprios usuários admin |
| Auditoria completa | Log de quem alterou o quê e quando |
| API pública com documentação | Swagger/OpenAPI para integrações externas |
| White-label | Customizar logo, domínio e cores por empresa |

---

## 5. Riscos e Mitigação

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Instabilidade do ERP do cliente | Alto | Cache de resposta + retry com backoff + circuit breaker |
| Alucinação do LLM | Alto | Prompt restritivo + temperatura baixa + validação de output |
| Custo de tokens elevado | Médio | Limitar histórico de contexto, usar modelos flash |
| Handoff confuso entre agentes | Médio | Passar contexto resumido ao agente de destino |
| Dados sensíveis em logs | Alto | Mascarar CPF/CNPJ, não logar conteúdo de mensagens em produção |
| Sessão corrompida | Baixo | TTL de sessão + fallback para nova sessão |

---

## 6. Princípios de Produto

- **Zero código para o cliente:** toda configuração via painel web.
- **IA-first sem menus numerados:** conversa natural com intent detection.
- **Multi-modelo:** flexibilidade de trocar o modelo por agente (Gemini, GPT, Claude).
- **Observabilidade desde o dia 1:** toda chamada gera execução rastreável.
- **SaaS pronto para múltiplos clientes:** isolamento total de dados por tenant.
