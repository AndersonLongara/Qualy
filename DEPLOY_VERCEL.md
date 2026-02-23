# Deploy na Vercel

## Pré-requisitos

- Conta na [Vercel](https://vercel.com)
- [Vercel CLI](https://vercel.com/docs/cli) instalada: `npm i -g vercel`

## 1. Primeiro deploy

No diretório raiz do projeto:

```bash
vercel
```

Siga o assistente (login, link a um projeto novo ou existente). Depois, para deploy de produção:

```bash
vercel --prod
```

## 2. Variáveis de ambiente (do `.env.local`)

Subir **todas** as variáveis do `.env.local` para o projeto na Vercel:

### Opção A – Script Node (recomendado)

Com o projeto já linkado (`vercel link`), na raiz do repositório:

```bash
node scripts/vercel-env-from-dotenv.js
```

Isso adiciona cada variável do `.env.local` em **production** e **preview**. Se alguma já existir, pode dar aviso; pode ignorar ou editar no dashboard.

### Opção B – Script PowerShell (Windows)

```powershell
Get-Content .env.local | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$' -and $matches[1] -notmatch '^#') {
    $name = $matches[1].Trim()
    $val = $matches[2].Trim().Trim('"').Trim("'")
    if ($name -and $val) {
      Write-Host "Adicionando $name..."
      $val | vercel env add $name production
      $val | vercel env add $name preview
    }
  }
}
```

### Opção C – Uma variável por vez (qualquer OS)

```bash
vercel env add PORT production
# Cole o valor quando solicitado (ex.: 3001)

vercel env add NODE_ENV production
vercel env add OPENROUTER_API_KEY production
vercel env add OPENROUTER_MODEL production
vercel env add ADMIN_API_KEY production
vercel env add SOUCHAT_API_URL production
vercel env add SOUCHAT_WEBHOOK_SECRET production
vercel env add SOUCHAT_API_KEY production
```

Repita para o ambiente `preview` se quiser o mesmo em previews:

```bash
vercel env add OPENROUTER_API_KEY preview
# ...
```

### Opção D – Dashboard Vercel

1. Abra o projeto em [vercel.com/dashboard](https://vercel.com/dashboard)
2. **Settings** → **Environment Variables**
3. Adicione cada variável do `.env.local` (nome e valor)

## 3. URL da API no frontend (produção)

Na Vercel, defina também (após o primeiro deploy):

- **Nome:** `VITE_CHAT_API_URL`  
- **Valor:** a URL do deploy (ex.: `https://seu-projeto.vercel.app`)  
- Ambientes: **Production** e **Preview**

Assim o frontend usa a mesma origem para chamar a API.

## 4. Redeploy após mudar env

Depois de adicionar ou alterar variáveis:

```bash
vercel --prod
```

## Estrutura do deploy

- **Frontend (Vite):** build em `simulator/dist`, servido na raiz do domínio.
- **API (Express):** roda como Serverless Function em `/api` e `/webhook`.
- **Rewrites** em `vercel.json` encaminham `/api/*` e `/webhook/*` para a função.

## Limitações

- **Arquivos em disco:** `config/tenants/*.json` e dados em memória (execuções, uso) são efêmeros entre invocações. Para persistência real use banco ou storage externo.
- **Cold start:** a primeira requisição após um tempo sem uso pode demorar um pouco mais.
