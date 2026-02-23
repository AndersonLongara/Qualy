# Como adicionar um novo cliente

Este guia permite configurar um novo cliente (tenant) sem alterar código.

## 1. Copiar o template de config

```bash
cp config/tenant.example.json config/tenant.json
```

## 2. Editar branding e API

Abra `config/tenant.json` e ajuste:

- **branding.companyName** — Nome da empresa do cliente
- **branding.assistantName** — Nome do assistente (ex.: "AltraFlow", "Assistente Vendas")
- **branding.productName** — (opcional) Nome do produto
- **api.baseUrl** — URL base da API do ERP do cliente (ex.: `https://api.cliente.com.br`), sem `/v1` no final

## 3. Prompt personalizado (opcional)

Para persona/tom próprio:

1. Crie o arquivo de prompt, por exemplo: `config/prompts/meu-cliente.md`
2. Escreva o conteúdo (persona, regras, tom de voz)
3. Em `config/tenant.json`, defina:

```json
"prompt": {
  "systemPromptPath": "config/prompts/meu-cliente.md"
}
```

Se não informar `systemPromptPath`, o sistema usa o prompt padrão (`src/core/ai/SYSTEM_PROMPT.md`).

## 4. Variáveis de ambiente (opcional)

As variáveis sobrescrevem o arquivo. Útil em produção para não versionar URLs ou nomes:

- `API_BASE_URL` — URL da API do cliente
- `ASSISTANT_NAME` — Nome do assistente
- `COMPANY_NAME` — Nome da empresa
- `SYSTEM_PROMPT_PATH` — Caminho para o arquivo de prompt

## 5. Reiniciar o servidor

Após alterar `config/tenant.json`, reinicie o backend para carregar a nova config.
