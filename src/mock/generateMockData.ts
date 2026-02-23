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
  "numero_nota": string,
  "valor_atualizado": number,
  "vencimento": "YYYY-MM-DD",
  "status": "vencido" | "a_vencer",
  "pdf_url"?: string,
  "linha_digitavel"?: string
}[]`,
        example: `{
  "12345678000195": [
    { "numero_nota": "NF-001", "valor_atualizado": 1500.00, "vencimento": "2025-03-01", "status": "a_vencer", "pdf_url": "https://exemplo.com/boleto1.pdf", "linha_digitavel": "10499.12345..." },
    { "numero_nota": "NF-002", "valor_atualizado": 800.50, "vencimento": "2025-01-15", "status": "vencido" }
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

export async function generateMockData({ description, section }: GenerateMockDataOptions): Promise<unknown> {
    if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY não configurada.');

    const schema = SECTION_SCHEMAS[section];
    const userPrompt = `Gere dados mock para a seção "${section}" com base nesta descrição:

"${description}"

Schema esperado:
${schema.instruction}

Exemplo de estrutura:
${schema.example}

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
        return JSON.parse(cleaned);
    } catch {
        throw new Error(`IA retornou JSON inválido: ${cleaned.substring(0, 200)}`);
    }
}
