# Especificação da API de Integração - Projeto AltraFlow

Este documento define os **contratos de dados (JSON)** que o sistema da AltraFlow deve fornecer para o funcionamento do Assistente Virtual.

**Padrão Global:**
- **Base URL:** `https://api.altraflow.com.br/v1` (Exemplo)
- **Autenticação:** `x-api-key` ou Bearer Token no Header.
- **Erros:** Devem retornar HTTP 4xx/5xx com JSON `{ "code": "ERROR_CODE", "message": "Descrição amigável" }`.

---

## 1. Clientes e Autenticação

### `GET /clientes?doc={cpf_cnpj}`
Valida se o cliente existe e retorna dados básicos.
**Response (200 OK):**
```json
{
  "id": "CUST-12345",
  "razao_social": "Mercadinho Exemplo LTDA",
  "fantasia": "Mercadinho do João",
  "documento": "12.345.678/0001-90",
  "status": "ativo", // ativo, bloqueado, inativo
  "filiais": [
    { "id": "FIL-01", "nome": "Matriz - SP" },
    { "id": "FIL-02", "nome": "Filial - RJ" }
  ]
}
```

### `POST /auth/send-code`
Envia código de verificação (OTP) para o contato cadastrado.
**Body:** `{ "documento": "..." }`

### `POST /auth/verify-code`
Valida o código.
**Body:** `{ "documento": "...", "code": "123456" }`
**Response:** `{ "token": "JWT_OU_SESSION_ID" }`

---

## 2. Financeiro

### `GET /financeiro/titulos?doc={cpf_cnpj}&status=aberto`
Lista títulos em aberto.
**Response (200 OK):**
```json
[
  {
    "id": "TIT-98765",
    "numero_nota": "102030",
    "valor_original": 1500.00,
    "valor_atualizado": 1500.00,
    "vencimento": "2023-10-30",
    "status": "vencido", // a_vencer, vencido
    "pdf_url": "https://...",
    "linha_digitavel": "23793.38128 60033.045209 76000.063300 1 894500000150000"
  }
]
```

### `POST /financeiro/titulos/{id}/segunda-via`
Solicita envio ou regeneração de boleto.

---

## 3. Faturamento

### `GET /faturamento/pedidos?doc={cpf_cnpj}&dias=60`
Lista pedidos recentes.
**Response:**
```json
[
  {
    "id": "PED-500",
    "data": "2023-10-15",
    "valor_total": 4500.00,
    "status": "faturado", // pendente, faturado, em_transito, entregue, cancelado
    "nfe": {
      "numero": "998877",
      "chave": "352310...",
      "xml_url": "https://...",
      "danfe_url": "https://..."
    },
    "rastreio": {
      "transportadora": "TransAltra",
      "codigo": "TRK-001"
    }
  }
]
```

---

## 4. Vendas (Catálogo e Pedido)

### `GET /vendas/estoque?busca={termo}&filial={id}`
Consulta produtos.
**Response:**
```json
[
  {
    "sku": "PROD-001",
    "nome": "Cimento CP II 50kg",
    "unidade": "SC",
    "estoque_disponivel": 500,
    "preco_tabela": 29.90,
    "preco_promocional": null,
    "imagem_url": "https://..."
  }
]
```

### `POST /vendas/pedido`
Envia pedido para o ERP.
**Body:**
```json
{
  "cliente_id": "CUST-12345",
  "filial_id": "FIL-01",
  "itens": [
    { "sku": "PROD-001", "quantidade": 10 }
  ],
  "pagamento": {
    "metodo": "boleto_prazo", // pix, cartao, boleto_prazo
    "condicao": "30_60_90"
  },
  "observacoes": "Entregar na porta lateral"
}
```
**Response:**
```json
{
  "pedido_id": "PED-NEW-01",
  "status": "aguardando_analise",
  "mensagem": "Pedido recebido com sucesso!"
}
```
