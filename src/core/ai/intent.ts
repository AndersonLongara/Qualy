/**
 * Intent Detection — classifica a mensagem do usuário ANTES de chamar o LLM.
 * Usa regex/keywords para rotas de alta confiança, deixando o LLM apenas para UNKNOWN.
 */

export type Intent =
    | 'GREETING'
    | 'STOCK_QUERY'
    | 'START_ORDER_WITH_QUANTITY'
    | 'START_ORDER'
    | 'PROVIDE_DOCUMENT'
    | 'PROVIDE_QUANTITY'
    | 'CONFIRM'
    | 'DENY'
    | 'FINANCIAL'
    | 'ORDER_STATUS'
    | 'HUMAN_AGENT'
    | 'UNKNOWN';

interface IntentRule {
    intent: Intent;
    patterns: RegExp[];
}

const INTENT_RULES: IntentRule[] = [
    {
        intent: 'PROVIDE_DOCUMENT',
        patterns: [
            /\b\d{3}\.?\d{3}\.?\d{3}[-.]?\d{2}\b/,        // CPF: 123.456.789-00
            /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}[-.]?\d{2}\b/, // CNPJ: 12.345.678/0001-90
            /\b\d{11}\b/,                                     // CPF sem formatação
            /\b\d{14}\b/,                                     // CNPJ sem formatação
        ],
    },
    // "sim quero 2 unidades" / "quero N unidades" — antes de CONFIRM e START_ORDER
    {
        intent: 'START_ORDER_WITH_QUANTITY',
        patterns: [
            /(sim\s*,?\s*)?(quero|levar|desejo|preciso)\s+\d+\s*unidades?/i,
            /\d+\s*unidades?\s*(do\s+)?(produto|esse)?/i,
        ],
    },
    {
        intent: 'CONFIRM',
        patterns: [
            /^(sim|s|yes|pode|pode ser|t[aá] bom|claro|com certeza|isso|isso mesmo|ok|beleza|bora|vamos|confirmo|confirma|aceito|certo)\s*[.!]?\s*$/i,
        ],
    },
    {
        intent: 'DENY',
        patterns: [
            /^(n[aã]o|nope|nem|deixa|n|cancela|cancelar|desisto)\s*[.!]?\s*$/i,
        ],
    },
    {
        intent: 'HUMAN_AGENT',
        patterns: [
            // Não incluir "transferir": pedidos como "transferir para vendas" devem ir ao LLM para usar a tool transferir_para_agente
            /\b(atendente|humano|pessoa|falar com algu[eé]m|suporte)\b/i,
        ],
    },
    {
        intent: 'START_ORDER',
        patterns: [
            /\b(fazer\s+(um\s+)?pedido|quero\s+(comprar|pedir|encomendar)|fechar\s+pedido|vamos\s+(fechar|fazer))\b/i,
            /\b(pedido\s+(com\s+)?este|comprar\s+esse|levar\s+esse)\b/i,
        ],
    },
    {
        intent: 'FINANCIAL',
        patterns: [
            /\b(boleto|2[aª]\s*via|t[ií]tulo|financeiro|d[ií]vida|pagar|pagamento|fatura)\b/i,
        ],
    },
    {
        intent: 'ORDER_STATUS',
        patterns: [
            /\b(status|acompanhar|rastrear|onde\s+est[aá]|meu\s+pedido|pedidos)\b/i,
        ],
    },
    {
        intent: 'STOCK_QUERY',
        patterns: [
            /\b(estoque|pre[cç]o|quanto\s+custa|disponibilidade|tem\s+.+\s*\?|valor|tabela)\b/i,
            /\bPROD-\d+/i,
            /\b(cimento|argamassa|tijolo|areia|ferro|tubo|tinta|cal|telha|vergalh[aã]o|bloco)\b/i,
        ],
    },
    {
        intent: 'GREETING',
        patterns: [
            /^(oi|ol[aá]|bom\s+dia|boa\s+tarde|boa\s+noite|e\s+a[ií]|fala|hey|hi|hello|eae)\s*[!.,]?\s*$/i,
        ],
    },
];

/**
 * Extracts quantity from a message like "quero 2 unidades" or "sim quero 5 unidades do produto".
 * Returns the first number in range 1–9999 or null.
 */
export const parseQuantityFromOrderMessage = (message: string): number | null => {
    const match = message.match(/\d+/);
    if (!match) return null;
    const n = parseInt(match[0], 10);
    return n >= 1 && n <= 9999 ? n : null;
};

/**
 * Detects the intent of a user message.
 * Returns the first matching intent or 'UNKNOWN'.
 */
export const detectIntent = (message: string): Intent => {
    const trimmed = message.trim();

    // Pure digits: check length to distinguish document vs quantity
    if (/^\d+$/.test(trimmed)) {
        const len = trimmed.length;
        if (len === 11 || len === 14) return 'PROVIDE_DOCUMENT';
        return 'PROVIDE_QUANTITY';
    }

    for (const rule of INTENT_RULES) {
        if (rule.patterns.some(p => p.test(trimmed))) {
            return rule.intent;
        }
    }

    return 'UNKNOWN';
};
