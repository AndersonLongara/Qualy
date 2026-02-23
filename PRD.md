# PRD - AltraFlow: Assistente Virtual WhatsApp

## 1. Visão Geral e Objetivos
**Objetivo Estratégico:** Reduzir drasticamente o atendimento humano e acelerar o autosserviço (self-service) através de um assistente virtual no WhatsApp.

**Frentes de Atuação:**
1.  **Comercial:** Cadastro, atualização e transbordo inteligente.
2.  **Financeiro:** Gestão de títulos, 2ª via de boletos e alertas automáticos de vencimento.
3.  **Faturamento:** Rastreamento de pedidos (últimos 60 dias) e envio de DANFE/XML.
4.  **Telemarketing/Vendas:** Consulta de estoque/preço, emissão de pedidos autenticada e status de pagamento.

## 2. Indicadores de Sucesso (KPIs)
Estes indicadores devem ser monitorados desde o Day 1:
- **Taxa de Deflexão:** % de atendimentos resolvidos sem intervenção humana.
- **TMA (Tempo Médio de Atendimento):** Tempo até a "resolução" do problema.
- **Taxa de Erro de Integração:** Falhas em ERP, geração de boletos, notas ou pedidos.
- **Taxa de Conversão:** De "Consulta de Preço" para "Pedido Emitido".
- **Funnel Drop-off:** Taxa de abandono por etapa (Auth, Seleção, Carrinho, Confirmação).

## 3. Estratégia de Entrega (MVP em Ondas)
Abordagem "MVP Inteligente" para gerar valor rápido e mitigar riscos.

### 🌊 Onda 1: MVP de Autosserviço (IA-First)
*Foco: Volume e Baixo Risco com Inteligência Artificial.*
- **Core:** AI Orchestrator (Intent Recognition + Tool Calling).
- **Interação:** Conversa Natural (Sem menus numéricos rígidos).
- **Financeiro:** Consulta de Títulos e Emissão de 2ª via (lista + PDF/Linha digitável).
- **Faturamento:** Status de pedidos (60 dias) e Download de DANFE/XML.
- **Handoff:** Transbordo inteligente quando a IA não souber resolver.

### 🌊 Onda 2: Vendas Assistidas (Geração de Receita)
*Foco: Funcionalidade Transacional.*
- **Catálogo:** Estoque e Preço por fornecedor.
- **Pedido:** Carrinho de compras, planos de pagamento, observações.
- **Checkout:** Confirmação por código (MFA) e Link de Pagamento (PIX/Cartão).
- **Acompanhamento:** Transmissão de pedido "Pendente" e rastreio.

### 🌊 Onda 3: Automação Proativa (Agente Autônomo)
*Foco: Retenção e Engajamento.*
- **Cobrança:** Alertas automáticos (Pré-vencimento, Dia D, Pós-vencimento).
- **Notificações:** Status de mudança de pedido (Faturado, Saiu para Entrega, etc.).
- **Segurança:** Recuperação de acesso automatizada com validação forte.

## 4. Riscos e Mitigação
| Risco | Impacto | Mitigação |
| :--- | :--- | :--- |
| **Instabilidade do ERP** | Alto | Camada de conexão com Cache, Retries exponenciais e Fila (Dead Letter Queues). |
| **Travamento do Usuário** | Médio | Aceitar múltiplos formatos de input ("1,3,4", "todos") e sempre numerar listas. |
| **Autenticação Fraca** | Crítico | Código de confirmação (OTP) com expiração curta (10 min). |
| **Handoff Confuso** | Médio | Fila específica por setor + Contexto da conversa enviado ao atendente ("Etiqueta"). |
