# 📦 MOCK_DATA — Dados de Teste da AltraFlow

Base de dados de teste completa para o Simulador da AltraFlow.
Cobre todos os cenários das **3 Ondas** do PRD.

---

## 🏢 Clientes (6 perfis — todos os status)

| CNPJ/CPF | Nome Fantasia | Status | Cenário |
|---|---|---|---|
| `12345678000190` | Mercadinho do João | ✅ Ativo | Caminho feliz padrão |
| `55566677000188` | Horizonte Engenharia | ✅ Ativo | Grande conta, alto volume |
| `52998224725` | José F. Silva | ✅ Ativo (PF) | Cliente pessoa física (CPF) |
| `98765432000100` | Pão Quente | 🔴 Bloqueado | Inadimplência (títulos > 30 dias) |
| `33344455000166` | Depósito Central | 🔴 Bloqueado | Limite de crédito excedido |
| `11122233000144` | Silva Materiais | ⚫ Inativo | Sem atividade > 180 dias |

---

## 💰 Títulos Financeiros — Ciclo de Vida Completo

### Cliente A — `12345678000190` (Mercadinho do João)

| ID | Nº Nota | Valor Original | Valor Atualizado | Vencimento | Status |
|---|---|---|---|---|---|
| `TIT-001` | 102030 | R$ 1.500,00 | **R$ 1.578,23** *(com juros)* | **-15 dias** | `vencido` |
| `TIT-002` | 102031 | R$ 2.000,00 | R$ 2.000,00 | **+3 dias** | `a_vencer` |
| `TIT-003` | 102032 | R$ 750,00 | R$ 750,00 | **+18 dias** | `a_vencer` |
| `TIT-004` | 102015 | R$ 3.200,00 | R$ 3.200,00 | **-45 dias** | `pago` ✅ |

### Cliente B — `98765432000100` (Pão Quente — Bloqueado)

| ID | Nº Nota | Valor | Vencimento | Status |
|---|---|---|---|---|
| `TIT-101` | 200010 | R$ 5.450,00 (+juros) | **-35 dias** | `vencido` |
| `TIT-102` | 200011 | R$ 3.384,00 (+juros) | **-31 dias** | `vencido` |
| `TIT-103` | 200012 | R$ 1.854,00 (+juros) | **-32 dias** | `vencido` |

> Total em aberto Cliente B: ~**R$ 10.688,00** — motivo do bloqueio.

### Cliente Grande — `55566677000188` (Horizonte Engenharia)

| ID | Nº Nota | Valor | Vencimento | Status |
|---|---|---|---|---|
| `TIT-401` | 300100 | R$ 45.000,00 | **+7 dias** | `a_vencer` |
| `TIT-402` | 300101 | R$ 38.000,00 | **+14 dias** | `a_vencer` |
| `TIT-403` | 300085 | R$ 22.000,00 | **-60 dias** | `pago` ✅ |

---

## 📦 Pedidos — Todos os Status do Ciclo de Vida

### Cliente A — `12345678000190`

| ID | Valor | Status | NF-e | Rastreio |
|---|---|---|---|---|
| `PED-001` | R$ 4.500,00 | ✅ `entregue` | 998877 | TransAltra / TRK-001 |
| `PED-002` | R$ 1.185,00 | 🚚 `em_transito` | 998878 | Correios / OJ123456789BR |
| `PED-003` | R$ 8.500,00 | 📄 `faturado` | 998900 | — aguardando coleta |
| `PED-004` | R$ 2.990,00 | ⏳ `aguardando_faturamento` | — | — |
| `PED-005` | R$ 5.670,00 | ❌ `cancelado` | — | — |

---

## 🏗️ Catálogo / Estoque (12 produtos, 6 categorias)

| SKU | Produto | Categoria | Estoque | Preço Tabela | Preço Promo |
|---|---|---|---|---|---|
| `PROD-001` | Cimento CP II 50kg | Cimento | 500 SC | R$ 29,90 | — |
| `PROD-008` | Cimento CP IV 50kg | Cimento | 80 SC | R$ 33,50 | **R$ 31,00** ⭐ |
| `PROD-009` | Cimento CP V ARI 50kg | Cimento | **0** | R$ 36,00 | — |
| `PROD-002` | Tijolo Baiano 8 Furos (Mil) | Alvenaria | 50 MIL | R$ 850,00 | **R$ 790,00** ⭐ |
| `PROD-010` | Bloco Concreto 14x19x39 | Alvenaria | 2000 PC | R$ 4,80 | — |
| `PROD-003` | Argamassa AC-III 20kg | Argamassa | **0** | R$ 35,50 | — |
| `PROD-011` | Argamassa Colante AC-I 20kg | Argamassa | 350 SC | R$ 22,00 | — |
| `PROD-004` | Tela Soldada Q138 (2x3m) | Ferragem | 120 PC | R$ 78,90 | **R$ 72,00** ⭐ |
| `PROD-012` | Ferro CA-50 10mm (Barra 12m) | Ferragem | 800 PC | R$ 52,00 | — |
| `PROD-005` | Cal Hidratada CH III 20kg | Cal | 300 SC | R$ 18,00 | — |
| `PROD-006` | Areia Média Lavada (m³) | Agregado | 200 M3 | R$ 85,00 | — |
| `PROD-007` | Brita 1 (m³) | Agregado | 150 M3 | R$ 120,00 | — |

---

## � Planos de Pagamento

| Código | Descrição | Desconto | Parcelas |
|---|---|---|---|
| `pix` | PIX à Vista | **5%** | 1x |
| `boleto_avista` | Boleto à Vista | **2%** | 1x |
| `30` | Boleto 30 dias | — | 1x |
| `30_60` | Boleto 30/60 dias | — | 2x |
| `30_60_90` | Boleto 30/60/90 dias | — | 3x |
| `cartao` | Cartão de Crédito | — | 1x |

---

## 🔐 Autenticação OTP

| Código | Resultado |
|---|---|
| `123456` | ✅ Válido → retorna `MOCK_TOKEN_123` (10 min) |
| `000000` | ⏱️ Expirado → `CODE_EXPIRED` |
| Qualquer outro | ❌ Inválido → `INVALID_CODE` |

---

## 🤖 Ferramentas do Agente (Tool Calling)

| Ferramenta | Gatilho | Parâmetros |
|---|---|---|
| `consultar_cliente` | Cadastro, status, verificação | `documento` |
| `consultar_titulos` | Boleto, 2ª via, financeiro | `documento`, `status?` |
| `consultar_pedidos` | Entrega, rastreio, NF-e, DANFE | `documento`, `status?` |
| `consultar_estoque` | Produto, preço, disponibilidade | `busca` |

---

## 💬 Roteiros de Teste — PRD Onda 1

### 🟢 Cenário 1 — 2ª Via Boleto Vencido (Caminho Feliz)
```
User → "Preciso do meu boleto"
IA   → Pede CNPJ
User → "12.345.678/0001-90"
IA   → [consultar_titulos] → TIT-001 vencido R$1.578,23 + TIT-002/TIT-003 a vencer
IA   → Envia links de PDF e linha digitável
```

### 🔴 Cenário 2 — Cliente Bloqueado por Inadimplência
```
User → "Quero fazer um pedido"
IA   → Pede CNPJ
User → "98.765.432/0001-00"
IA   → [consultar_cliente] → status=bloqueado, motivo=inadimplência
IA   → Informa bloqueio, oferece consultar títulos pendentes ou transferir
```

### ⚫ Cenário 3 — Cliente Inativo
```
User → "Quero reativar minha conta"
IA   → [consultar_cliente] → status=inativo
IA   → Informa inatividade e transfere para equipe comercial
```

### 🚚 Cenário 4 — Rastreio de Pedido
```
User → "Onde está meu pedido?"
IA   → Pede CNPJ
User → "12.345.678/0001-90"
IA   → [consultar_pedidos] → PED-002 em_transito via Correios OJ123456789BR
```

### ❌ Cenário 5 — Pedido Cancelado
```
User → "Por que meu pedido foi cancelado?"
IA   → [consultar_pedidos] → PED-005 cancelado, motivo=solicitação do cliente
```

### 📦 Cenário 6 — NF-e e DANFE
```
User → "Preciso da nota fiscal do meu pedido"
IA   → [consultar_pedidos] → PED-001/PED-002/PED-003 com nfe.danfe_url
IA   → Envia link do DANFE e XML
```

## 💬 Roteiros de Teste — PRD Onda 2

### ⭐ Cenário 7 — Produto com Preço Promocional
```
User → "Qual o preço do cimento CP IV?"
IA   → [consultar_estoque] → PROD-008 R$33,50, mas em PROMOÇÃO por R$31,00
```

### 🚫 Cenário 8 — Produto Sem Estoque
```
User → "Tem argamassa AC-III?"
IA   → [consultar_estoque] → PROD-003 estoque=0, sugere AC-I (PROD-011) disponível
```

### 🛒 Cenário 9 — Criar Pedido com Autenticação
```
User → "Quero 50 sc de cimento CP II"
IA   → Consulta estoque, confirma disponibilidade e preço
IA   → Solicita autenticação (OTP)
User → "123456"
IA   → [verify-code] → token válido → POST /v1/vendas/pedido → PED-NEW-XXX
```

### 💳 Cenário 10 — Consultar Planos de Pagamento
```
User → "Quais as condições de pagamento?"
IA   → [GET /v1/vendas/planos-pagamento] → Lista PIX 5% desc, boleto, 30/60/90
```
