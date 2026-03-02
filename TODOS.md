# TODOs — AltraIA

Rastreamento de tarefas do projeto. `[x]` = concluído, `[ ]` = pendente.

---

## Funcionalidades entregues (v1 MVP)

- [x] Multi-tenant: CRUD de empresas via painel e API REST
- [x] Multi-agente: múltiplos agentes por empresa com configuração individual
- [x] Configuração de agente: prompt (texto ou arquivo .md), modelo, temperatura
- [x] Modos de integração por agente: Desativada / Mock / Produção
- [x] Ferramentas built-in: consultar_cliente, consultar_titulos, consultar_pedidos, consultar_estoque
- [x] Tools custom (HTTP GET/POST) criáveis via painel
- [x] Teste de tools diretamente no painel (modal com args + output)
- [x] Vínculo de tools por agente (toolIds)
- [x] Roteamento entre agentes (handoff / transferir_para_agente)
- [x] Agente de entrada por empresa (chatFlow.entryAgentId)
- [x] Escalação para atendente humano (webhook + mensagem customizável)
- [x] Chat preview por agente (aba Chat no detalhe do agente)
- [x] Chat preview geral da empresa (usando fluxo de entrada)
- [x] Link público: /t/:tenantId e /t/:tenantId/:agentId
- [x] Histórico de conversas por sessão com timeline de handoffs
- [x] Execuções com status, duração, origem, debug
- [x] Rastreamento de consumo por agente
- [x] Webhook de entrada (WhatsApp / SouChat)
- [x] Configuração de webhook por agente (aba Webhook)
- [x] Persistência: JSON (dev) + Postgres via Drizzle ORM
- [x] Sessões: in-memory (dev) + Redis (Vercel KV)
- [x] Deploy serverless Vercel (api/index.ts)
- [x] Templates de agente (atendimento, vendas, SAC, financeiro...)
- [x] Painel admin protegido por ADMIN_API_KEY
- [x] Tema claro/escuro no painel
- [x] Incrementar / Refinar prompt com IA (botões no painel)
- [x] Aba Links (link público do agente com QR code)
- [x] Aba Roteamento (gerenciar handoffRules do agente)
- [x] State machine do fluxo de pedido (order-flow)
- [x] Testes Jest: chat-flow, tools, intent, format, document, webhook, executions

---

## Onda 2 — Gestão Operacional

| ID | Status | Tarefa |
|----|--------|--------|
| O2-1 | [ ] | Dashboard de métricas: volume diário, taxa de erro, duração média por empresa/agente |
| O2-2 | [ ] | Busca e filtros avançados no histórico (data, status, agente, texto) |
| O2-3 | [ ] | Exportar execuções (CSV ou JSON) |
| O2-4 | [ ] | Alertas de erros: notificar quando tool falha repetidamente (ex.: e-mail ou webhook) |
| O2-5 | [ ] | Rate limit por telefone (proteção contra abuso) |
| O2-6 | [ ] | Autenticação real no painel (login com usuário/senha ou OAuth) — substituir ADMIN_API_KEY simples |
| O2-7 | [ ] | Cobertura de testes > 80% (adicionar testes de integração de admin router) |
| O2-8 | [ ] | Limpar debug logs residuais (fetch para 127.0.0.1:7520 no tenantRepository.ts) |

---

## Onda 3 — Expansão de Canais e Automações

| ID | Status | Tarefa |
|----|--------|--------|
| O3-1 | [ ] | Notificações proativas: boletos a vencer, status de pedido, cobranças |
| O3-2 | [ ] | Agendamento de mensagens (envio programado ou por evento) |
| O3-3 | [ ] | OTP / Autenticação do cliente final (código de verificação para operações sensíveis) |
| O3-4 | [ ] | Suporte a Telegram como canal de entrada |
| O3-5 | [ ] | Widget web (chat embutível em sites) |
| O3-6 | [ ] | Gestão de contatos / CRM light (lista de clientes atendidos com histórico) |
| O3-7 | [ ] | Marketplace de templates de agente |

---

## Onda 4 — Plataforma SaaS

| ID | Status | Tarefa |
|----|--------|--------|
| O4-1 | [ ] | Planos e billing (cobrança por mensagem ou por empresa via Stripe) |
| O4-2 | [ ] | Onboarding guiado (wizard: criar empresa + agente + conectar WhatsApp) |
| O4-3 | [ ] | Multi-usuário por empresa (cada empresa tem seus admins) |
| O4-4 | [ ] | Auditoria: log de alterações (quem, o quê, quando) |
| O4-5 | [ ] | API pública com documentação Swagger/OpenAPI |
| O4-6 | [ ] | White-label: customizar logo, domínio e cores por empresa |

---

## Dívida técnica e melhorias pontuais

| ID | Status | Tarefa |
|----|--------|--------|
| DT-1 | [ ] | Remover código de debug agent (fetch 127.0.0.1:7520) do tenantRepository.ts |
| DT-2 | [ ] | Mover inline debug snippets de todos os arquivos para logger centralizado |
| DT-3 | [ ] | Adicionar paginação nas rotas de execuções e conversas |
| DT-4 | [ ] | Implementar retry com exponential backoff nas chamadas a APIs de ERP |
| DT-5 | [ ] | Circuit breaker para APIs externas instáveis |
| DT-6 | [ ] | Validação de OPENROUTER_API_KEY na subida (aviso em dev, exit(1) em prod) |
| DT-7 | [ ] | max_tokens + tratamento de finish_reason=length no provider |
| DT-8 | [ ] | Passar contexto resumido ao agente de destino no handoff |

---

## Ordem de prioridade sugerida

1. **DT-1, DT-2** — Limpar código de debug residual (impacta leitura e segurança)
2. **O2-1** — Dashboard de métricas (valor imediato para clientes)
3. **O2-5, DT-3** — Rate limit + paginação (estabilidade)
4. **O2-6** — Auth real no painel (segurança)
5. **O3-1** — Notificações proativas (receita e retenção)
6. **O4-2** — Onboarding guiado (escalar novos clientes)
