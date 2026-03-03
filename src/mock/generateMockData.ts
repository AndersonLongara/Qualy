/**
 * Gera dados mock estruturados via IA a partir de uma descrição textual.
 * Cada seção retorna o formato JSON esperado pelas tools do agente.
 */
import OpenAI from 'openai';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash-lite';

export type MockSection = 'clientes' | 'titulos' | 'pedidos' | 'estoque';

export interface GenerateMockDataOptions {
    description: string;
    section: MockSection;
}

const SECTION_SCHEMAS: Record<MockSection, { instruction: string; example: string }> = {
    clientes: {
        instruction: `Gere um objeto JSON cujas chaves são CPF/CNPJ (somente dígitos) e os valores seguem o schema:
{
  "razao_social": string,
  "fantasia": string,
  "status": "ativo" | "bloqueado" | "inativo",
  "filiais"?: { "id": string, "nome": string }[]
}`,
        example: `{
  "12345678000195": { "razao_social": "Construtora ABC Ltda", "fantasia": "ABC Construções", "status": "ativo", "filiais": [{ "id": "001", "nome": "Matriz" }] },
  "98765432000188": { "razao_social": "Materiais XYZ SA", "fantasia": "XYZ Materiais", "status": "bloqueado", "filiais": [] }
}`,
    },
    titulos: {
        instruction: `Gere um objeto JSON cujas chaves são CPF/CNPJ (somente dígitos) e os valores são arrays de títulos com schema:
{
  "id_titulo": string,
  "numero_nota": string,
  "valor_atualizado": number,
  "vencimento": "YYYY-MM-DD",
  "status": "vencido" | "a_vencer" | "pago",
  "link_boleto"?: string | null,
  "pdf_url"?: string | null,
  "linha_digitavel"?: string | null
}[]`,
        example: `{
  "12345678000195": [
    { "id_titulo": "TIT-001", "numero_nota": "NF-001", "valor_atualizado": 1500.00, "vencimento": "2025-03-01", "status": "a_vencer", "link_boleto": "https://exemplo.com/boleto1.pdf", "pdf_url": "https://exemplo.com/boleto1.pdf", "linha_digitavel": "10499.12345..." },
    { "id_titulo": "TIT-002", "numero_nota": "NF-002", "valor_atualizado": 800.50, "vencimento": "2025-01-15", "status": "vencido", "link_boleto": null, "pdf_url": null, "linha_digitavel": null }
  ]
}`,
    },
    pedidos: {
        instruction: `Gere um objeto JSON cujas chaves são CPF/CNPJ (somente dígitos) e os valores são arrays de pedidos com schema:
{
  "id": string,
  "data": "YYYY-MM-DD",
  "valor_total": number,
  "status": "faturado" | "em_transito" | "aguardando_faturamento",
  "nfe"?: { "numero": string, "danfe_url": string },
  "rastreio"?: { "transportadora": string, "codigo": string, "status": string }
}[]`,
        example: `{
  "12345678000195": [
    { "id": "PED-1234", "data": "2025-02-10", "valor_total": 3200.00, "status": "em_transito", "nfe": { "numero": "NF-5678", "danfe_url": "https://exemplo.com/danfe.pdf" }, "rastreio": { "transportadora": "Correios", "codigo": "BR123456789", "status": "Em rota de entrega" } }
  ]
}`,
    },
    estoque: {
        instruction: `Gere um array JSON de produtos com schema:
{
  "nome": string,
  "sku": string,
  "estoque_disponivel": number,
  "preco_tabela": number,
  "preco_promocional"?: number | null
}[]`,
        example: `[
  { "nome": "Cimento CP-II 50kg", "sku": "CIM-001", "estoque_disponivel": 500, "preco_tabela": 42.00, "preco_promocional": 38.00 },
  { "nome": "Areia Grossa Saca 30kg", "sku": "ARE-002", "estoque_disponivel": 0, "preco_tabela": 18.50, "preco_promocional": null }
]`,
    },
};

const SYSTEM_INSTRUCTION = `Você é um gerador de dados de teste JSON para sistemas de ERP.
Retorne APENAS o JSON solicitado, sem explicações, sem markdown, sem blocos de código.
O JSON deve ser válido e seguir exatamente o schema indicado.`;

const PEDIDO_STATUSES = new Set([
  'pendente',
  'aguardando_faturamento',
  'faturado',
  'em_transito',
  'entregue',
  'cancelado',
]);

const SECTION_EXTRA_RULES: Record<MockSection, string> = {
  clientes: `Regras adicionais obrigatórias para a seção "clientes":
- Use somente CPF/CNPJ com dígitos como chave.
- Cada cliente deve ter: razao_social, fantasia, status e filiais.
- status permitido: ativo, bloqueado, inativo.
- filiais deve ser array (pode ser vazio), com itens { id, nome }.`,
  titulos: `Regras adicionais obrigatórias para a seção "titulos":
- Use somente CPF/CNPJ com dígitos como chave.
- Sempre inclua id_titulo em cada item.
- Sempre inclua link_boleto e pdf_url (podem ser null, mas devem existir).
- Quando houver link de boleto, link_boleto e pdf_url devem ter o mesmo valor.
- status permitido: a_vencer, vencido, pago.
- valor_atualizado deve ser number (nunca string).`,
  pedidos: `Regras adicionais obrigatórias para a seção "pedidos":
- Use somente CPF/CNPJ com dígitos como chave.
- Cada item deve ter: id, data, valor_total e status.
- status permitido: pendente, aguardando_faturamento, faturado, em_transito, entregue, cancelado.
- nfe e rastreio devem ser objeto ou null (não string).`,
  estoque: `Regras adicionais obrigatórias para a seção "estoque":
- Retorne um array de produtos (não objeto).
- Cada item deve ter: nome, sku, estoque_disponivel, preco_tabela.
- preco_promocional pode ser number ou null.
- estoque_disponivel e preços devem ser number (nunca string).`,
};

function normalizeClientesData(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const root = data as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [rawDoc, rawClient] of Object.entries(root)) {
    const doc = String(rawDoc).replace(/\D/g, '');
    if (!doc) continue;

    const c = rawClient && typeof rawClient === 'object' ? rawClient as Record<string, unknown> : {};
    const razaoSocial = String(c.razao_social ?? c.razaoSocial ?? c.nome ?? c.name ?? c.fantasia ?? `Cliente ${doc.slice(-4)}`);
    const fantasia = String(c.fantasia ?? c.nome_fantasia ?? c.apelido ?? razaoSocial);
    const rawStatus = String(c.status ?? 'ativo').toLowerCase();
    const status = rawStatus.includes('bloq')
      ? 'bloqueado'
      : rawStatus.includes('inativ')
        ? 'inativo'
        : 'ativo';

    const filiaisSource = Array.isArray(c.filiais) ? c.filiais : [];
    const filiais = filiaisSource
      .map((f, idx) => {
        const filial = f && typeof f === 'object' ? f as Record<string, unknown> : {};
        const id = String(filial.id ?? filial.codigo ?? `${idx + 1}`).trim();
        const nome = String(filial.nome ?? filial.name ?? `Filial ${idx + 1}`).trim();
        return { id, nome };
      })
      .filter((f) => f.id && f.nome);

    out[doc] = {
      razao_social: razaoSocial,
      fantasia,
      status,
      filiais,
    };
  }

  return out;
}

function normalizeTitulosData(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const out: Record<string, unknown> = {};
  const root = data as Record<string, unknown>;

  for (const [rawDoc, titles] of Object.entries(root)) {
    const doc = String(rawDoc).replace(/\D/g, '');
    if (!doc) continue;
    if (!Array.isArray(titles)) continue;

    out[doc] = titles.map((item, idx) => {
      const t = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      const numeroNota = String(t.numero_nota ?? t.id_titulo ?? t.id ?? `NF-${idx + 1}`);
      const idTitulo = String(t.id_titulo ?? t.id ?? `TIT-${numeroNota.replace(/[^a-zA-Z0-9]/g, '')}`);
      const rawStatus = String(t.status ?? 'a_vencer').toLowerCase();
      const status = rawStatus === 'vencido' || rawStatus === 'pago' ? rawStatus : 'a_vencer';
      const linkBoleto = typeof t.link_boleto === 'string'
        ? t.link_boleto
        : (typeof t.pdf_url === 'string' ? t.pdf_url : null);
      const pdfUrl = typeof t.pdf_url === 'string'
        ? t.pdf_url
        : (typeof linkBoleto === 'string' ? linkBoleto : null);
      const linhaDigitavel = typeof t.linha_digitavel === 'string' ? t.linha_digitavel : null;
      const valor = Number(t.valor_atualizado ?? 0);

      return {
        id_titulo: idTitulo,
        numero_nota: numeroNota,
        valor_atualizado: Number.isFinite(valor) ? valor : 0,
        vencimento: String(t.vencimento ?? ''),
        status,
        link_boleto: linkBoleto,
        pdf_url: pdfUrl,
        linha_digitavel: linhaDigitavel,
      };
    });
  }

  return out;
}

function normalizePedidosData(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const root = data as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [rawDoc, rawOrders] of Object.entries(root)) {
    const doc = String(rawDoc).replace(/\D/g, '');
    if (!doc) continue;
    if (!Array.isArray(rawOrders)) continue;

    out[doc] = rawOrders.map((item, idx) => {
      const p = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      const id = String(p.id ?? p.pedido ?? p.numero ?? `PED-${idx + 1}`);
      const dataPedido = String(p.data ?? p.data_pedido ?? p.emissao ?? '');
      const valor = Number(p.valor_total ?? p.valor ?? p.total ?? 0);
      const rawStatus = String(p.status ?? 'aguardando_faturamento').toLowerCase().replace(/\s+/g, '_');
      const status = PEDIDO_STATUSES.has(rawStatus) ? rawStatus : 'aguardando_faturamento';

      const nfeObj = p.nfe && typeof p.nfe === 'object' ? p.nfe as Record<string, unknown> : null;
      const nfeNumero = String(nfeObj?.numero ?? p.nfe_numero ?? '').trim();
      const danfeUrl = String(nfeObj?.danfe_url ?? p.danfe_url ?? '').trim();
      const nfe = nfeNumero
        ? {
          numero: nfeNumero,
          danfe_url: danfeUrl || null,
        }
        : null;

      let rastreio: { transportadora: string; codigo: string; status: string } | null = null;
      if (p.rastreio && typeof p.rastreio === 'object') {
        const r = p.rastreio as Record<string, unknown>;
        rastreio = {
          transportadora: String(r.transportadora ?? 'Transportadora não informada'),
          codigo: String(r.codigo ?? 'N/A'),
          status: String(r.status ?? 'Sem atualização'),
        };
      } else if (typeof p.rastreio === 'string' && p.rastreio.trim()) {
        rastreio = {
          transportadora: 'Transportadora não informada',
          codigo: 'N/A',
          status: p.rastreio.trim(),
        };
      }

      return {
        id,
        data: dataPedido,
        valor_total: Number.isFinite(valor) ? valor : 0,
        status,
        nfe,
        rastreio,
      };
    });
  }

  return out;
}

function normalizeEstoqueData(data: unknown): unknown {
  const sourceArray = Array.isArray(data)
    ? data
    : (data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).produtos)
      ? (data as Record<string, unknown>).produtos as unknown[]
      : []);

  return sourceArray.map((item, idx) => {
    const p = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const nome = String(p.nome ?? p.produto ?? p.descricao ?? `Produto ${idx + 1}`);
    const sku = String(p.sku ?? p.codigo ?? p.id ?? `SKU-${idx + 1}`);
    const estoque = Number(p.estoque_disponivel ?? p.estoque ?? p.quantidade ?? p.qtd ?? 0);
    const precoTabela = Number(p.preco_tabela ?? p.preco ?? p.preco_unitario ?? p.valor ?? 0);
    const precoPromocionalRaw = p.preco_promocional ?? p.promocao ?? null;
    const precoPromocional = precoPromocionalRaw === null || precoPromocionalRaw === undefined
      ? null
      : Number(precoPromocionalRaw);

    return {
      nome,
      sku,
      estoque_disponivel: Number.isFinite(estoque) ? Math.max(0, estoque) : 0,
      preco_tabela: Number.isFinite(precoTabela) ? precoTabela : 0,
      preco_promocional: Number.isFinite(precoPromocional as number) ? precoPromocional : null,
    };
  });
}

export async function generateMockData({ description, section }: GenerateMockDataOptions): Promise<unknown> {
    if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY não configurada.');

    const schema = SECTION_SCHEMAS[section];
    const userPrompt = `Gere dados mock para a seção "${section}" com base nesta descrição:

"${description}"

Schema esperado:
${schema.instruction}

Exemplo de estrutura:
${schema.example}

${SECTION_EXTRA_RULES[section]}

Retorne APENAS o JSON, sem texto adicional.`;

    const openai = new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: OPENROUTER_API_KEY,
        defaultHeaders: {
            'HTTP-Referer': 'https://altraflow.com',
            'X-Title': 'AltraFlow Mock Generator',
        },
    });

    const completion = await openai.chat.completions.create({
        model: OPENROUTER_MODEL,
        messages: [
            { role: 'system', content: SYSTEM_INSTRUCTION },
            { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2048,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? '';
    if (!raw) throw new Error('IA não retornou dados.');

    // Remove eventual markdown code block wrapping
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    try {
        const parsed = JSON.parse(cleaned);
        if (section === 'clientes') return normalizeClientesData(parsed);
        if (section === 'titulos') return normalizeTitulosData(parsed);
        if (section === 'pedidos') return normalizePedidosData(parsed);
        if (section === 'estoque') return normalizeEstoqueData(parsed);
        return parsed;
    } catch {
        throw new Error(`IA retornou JSON inválido: ${cleaned.substring(0, 200)}`);
    }
}
