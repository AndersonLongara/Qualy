# TODOs — Plano Arquitetural AltraFlow

Lista completa de tarefas do plano. Marque com `[x]` quando concluído. Ordem de execução: Fase 1 → 2 → 3 → 4 → 5.

---

## Checklist rápido (todas as to-dos)

- [ ] **T1** — Intent START_ORDER_WITH_QUANTITY + parseQuantityFromOrderMessage
- [ ] **T2** — Order flow: quantidade pré-preenchida, awaiting_cpf → awaiting_confirmation
- [ ] **T6** — Ordem dos intents: START_ORDER_WITH_QUANTITY antes de CONFIRM
- [ ] **Roteamento** — server.ts: rotear START_ORDER_WITH_QUANTITY para order flow
- [ ] **T3** — Provider: max_tokens, finish_reason length, error_dump.json
- [ ] **T4** — Provider: fallback para "..." ou conteúdo vazio
- [ ] **T8** — Log servidor: "(truncado no log)"
- [ ] **T5** — Order flow: POST /v1/vendas/pedido ao confirmar
- [ ] **README** — README.md com stack, arquitetura, fluxo, clientes de teste
- [ ] **TODOS** — TODOS.md com T1–T12 e ordem sugerida
- [ ] **T7** — Validação OPENROUTER_API_KEY na subida
- [ ] **T9** — README: fluxo recomendado de pedido
- [ ] **T10** — v1Router.ts + app.use('/v1', createV1Router(...))
- [ ] **T11** — sessionStore.ts + sessionStore.get(phone)
- [ ] **T12** — chat-flow.test.ts: intent, parseQuantity, processOrderFlow

---

## Fase 1 — Comportamento do agente (crítico)

| ID | Status | Tarefa | Arquivos | Critério de aceite |
|----|--------|--------|----------|--------------------|
| T1 | [ ] | Adicionar intent `START_ORDER_WITH_QUANTITY` com padrões para "quero N unidades", "sim quero N unidades", "N unidades do produto". Exportar `parseQuantityFromOrderMessage(message)`. | `src/core/ai/intent.ts` | `detectIntent("sim quero 2 unidades do produto") === 'START_ORDER_WITH_QUANTITY'`; `parseQuantityFromOrderMessage("sim quero 2 unidades") === 2`. |
| T2 | [ ] | No order flow: em idle com intent `START_ORDER_WITH_QUANTITY` e produto definido, extrair quantidade, setar na sessão, transicionar para `awaiting_cpf` (ou `awaiting_confirmation` se quantidade > estoque). Em `awaiting_cpf`, se `quantity` já estiver setada, após validar CPF ir para `awaiting_confirmation` com resumo. | `src/core/ai/order-flow.ts` | Para "sim quero 2 unidades" com lastProduct, resposta pede CPF e `newState.quantity === 2`; após CPF válido, resposta é resumo e confirmação. |
| T6 | [ ] | Garantir ordem das regras de intent: START_ORDER_WITH_QUANTITY antes de CONFIRM e START_ORDER. | `src/core/ai/intent.ts` | "sim quero 2 unidades" não é classificado como CONFIRM. |
| Roteamento | [ ] | Em `server.ts`, tratar `intent === 'START_ORDER_WITH_QUANTITY'` como START_ORDER: setar `session.order.product = session.lastProduct` e chamar `processOrderFlow`. | `src/mock/server.ts` | Mensagem "sim quero 2 unidades" após consulta de produto é respondida pelo order flow, não pelo LLM. |

---

## Fase 2 — Provider e log

| ID | Status | Tarefa | Arquivos | Critério de aceite |
|----|--------|--------|----------|--------------------|
| T3 | [ ] | Definir `max_tokens` (ex.: 1024) nas chamadas ao OpenRouter. Se `finish_reason === 'length'`, marcar resposta como truncada (fallback ou sufixo). Manter dump em `error_dump.json` quando conteúdo vazio. | `src/core/ai/provider.ts` | Respostas longas não cortam sem aviso; conteúdo vazio gera dump. |
| T4 | [ ] | Se `content` for apenas "..." ou string muito curta/não informativa, retornar mensagem fixa em vez do conteúdo bruto. | `src/core/ai/provider.ts` | Usuário nunca recebe "..." como resposta. |
| T8 | [ ] | No log da resposta no servidor, usar "(truncado no log)" quando truncar no console. | `src/mock/server.ts` | Log não exibe "..." como se fosse a resposta enviada. |

---

## Fase 3 — Integração de pedido

| ID | Status | Tarefa | Arquivos | Critério de aceite |
|----|--------|--------|----------|--------------------|
| T5 | [ ] | No order flow, ao confirmar (intent CONFIRM em awaiting_confirmation), chamar `POST /v1/vendas/pedido` com documento, cliente_nome, itens (sku, nome, quantidade, preco_unitario). Incluir `pedido_id` e mensagem da API na resposta; em erro de rede, mensagem de fallback. | `src/core/ai/order-flow.ts` | Confirmação exibe número do pedido quando a API retorna sucesso. |

---

## Fase 4 — Documentação e operação

| ID | Status | Tarefa | Arquivos | Critério de aceite |
|----|--------|--------|----------|--------------------|
| README | [ ] | Criar README.md na raiz: título, descrição, stack, estrutura de pastas, pré-requisitos, como rodar (backend + simulador), variáveis de ambiente, diagrama de arquitetura do chat, fluxo recomendado de pedido, clientes de teste, testes. | `README.md` | Desenvolvedor consegue rodar o projeto e entender o fluxo só com o README. |
| TODOS | [ ] | Manter TODOS.md com as tarefas T1–T12 (e Roteamento, README) listadas com prioridade e status; incluir ordem sugerida. | `TODOS.md` | Lista rastreável e ordenada. |
| T7 | [ ] | Na subida do servidor, carregar `.env.local` e validar `OPENROUTER_API_KEY`; se vazia, logar aviso em destaque; se `NODE_ENV === 'production'`, `process.exit(1)`. | `src/mock/server.ts` | Servidor não sobe em produção sem chave; em dev, aviso visível. |
| T9 | [ ] | Documentar no README o fluxo: consultar produto → "quero N unidades" ou "fazer pedido" → CPF → quantidade (se ainda não informada) → confirmação. | `README.md` | Fluxo de pedido explícito no README. |

---

## Fase 5 — Arquitetura e testes

| ID | Status | Tarefa | Arquivos | Critério de aceite |
|----|--------|--------|----------|--------------------|
| T10 | [ ] | Extrair rotas `/v1/*` para um router (ex.: `createV1Router(deps)` em `v1Router.ts`); montar em `server.ts` com `app.use('/v1', createV1Router(...))`. | `src/mock/v1Router.ts`, `src/mock/server.ts` | Rotas de negócio mock ficam em módulo separado. |
| T11 | [ ] | Introduzir store de sessão (ex.: `sessionStore.get(phone)`); implementação in-memory em módulo próprio (ex.: `sessionStore.ts`); servidor usa o store em vez de objeto global SESSIONS. | `src/mock/sessionStore.ts`, `src/mock/server.ts` | Sessão acessada via abstração; troca futura por Redis/arquivo possível. |
| T12 | [ ] | Adicionar testes: (1) `detectIntent("sim quero 2 unidades do produto") === 'START_ORDER_WITH_QUANTITY'`; (2) `parseQuantityFromOrderMessage` retorna número correto; (3) com lastProduct e "sim quero 2 unidades", `processOrderFlow` retorna resposta não vazia, sem "...", pedindo CPF e com quantity setada. | `src/__tests__/chat-flow.test.ts` | Testes automatizados cobrem o cenário crítico e passam. |

---

## Ordem de execução obrigatória

1. **T1, T2, T6 + Roteamento** — Intent e order flow (elimina o "..." no cenário da imagem).
2. **T3, T4, T8** — Provider e log.
3. **T5** — Integração com `POST /v1/vendas/pedido`.
4. **README, TODOS, T7, T9** — Documentação e validação de env.
5. **T10, T11, T12** — Router `/v1`, session store e testes do cenário.

**Dependências:** T2 depende de T1. Roteamento depende de T1. T5 depende do order flow. T12 depende de T1 e T2.

---

## Definição de concluído

- Todas as tarefas das fases 1 a 5 implementadas conforme critérios de aceite.
- README.md e TODOS.md existem na raiz e estão atualizados.
- Testes do cenário "consulta PROD-008 → sim quero 2 unidades" existem e passam.
- Nenhuma resposta do assistente é literalmente "..." nesse fluxo; o order flow é acionado e pede CPF ou confirmação conforme o estado.
