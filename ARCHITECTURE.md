# Arquitetura do Sistema - Projeto AltraFlow

## 1. Visão Geral (4 Camadas)

O sistema segue uma arquitetura em camadas para garantir escalabilidade e manutenção.

### 1.1 Canal WhatsApp (Via SouChat API)
- **Responsabilidade:** Interface de entrada/saída.
- **Funções:** Receber mensagem (`/webhook`) e repassar ao AI Engine.

### 1.2 AI Engine (Gemini via OpenRouter)
- **Responsabilidade:** O "Cérebro" do assistente.
- **Funções:**
  - **Intent Recognition:** Entender o que o usuário quer (sem menus fixos).
  - **Tool Calling:** Decidir qual ferramenta chamar (ex: `consultar_titulos`, `ver_estoque`).
  - **Generation:** Gerar respostas naturais e humanizadas.

### 1.3 API de Negócio (Camada AltraFlow)
- **Responsabilidade:** Regras de negócio e orquestração de chamadas.
- **Endpoints Principais:**
  - `GET /clientes?doc={cpf_cnpj}`: Validação e consulta de cliente.
  - `GET /financeiro/titulos?doc={...}`: Listagem de títulos em aberto.
  - `POST /financeiro/boletos/segunda-via`: Solicitação de PDF/Linha digitável.
  - `GET /faturamento/pedidos?doc={...}&dias=60`: Histórico recente.
  - `GET /vendas/estoque?sku={...}`: Consulta de disponibilidade.
  - `POST /vendas/pedido`: Criação de pedido.

### 1.3 Conectores (ERP/Legado)
- **Responsabilidade:** Abstrair a comunicação com sistemas legados.
- **Padrões:**
  - **Fila de Mensageria:** Para garantir entrega (RabbitMQ/SQS/Redis).
  - **Retry Pattern:** Retentativas com *exponential backoff* para falhas transientes.
  - **Circuit Breaker:** Proteção contra sobrecarga do ERP.

### 1.4 Observabilidade & Auditoria
- **Logs:** Rastreamento por `conversationId`.
- **Trilha de Auditoria:** Registro de quem fez o que (IP, Timestamp, Ação).
- **Métricas:** Quantidade de requisições, erros por endpoint, tempo de resposta.

## 2. Segurança
- **Mascaramento:** CPF/CNPJ mascarados nos logs (`***.***.***-**`).
- **Rate Limit:** Limite de requisições por número de telefone.
- **Tokens:** `Auth-Token` para comunicação entre camadas.
- **Sessão:** Expiração automática de sessão inativa.
