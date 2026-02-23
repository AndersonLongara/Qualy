/**
 * Registro de uso de tokens por tenant (M5).
 * Persiste em memória; em produção pode ser substituído por banco/arquivo.
 * Custo estimado por modelo (OpenRouter-style: USD por 1M tokens).
 */
import {
    getUsageTotals,
    getUsageTotalsWithCost,
    listUsageRecords,
    recordUsage,
} from '../db/repositories/usageRepository';

export interface TokenUsageRecord {
    tenantId: string;
    assistantId?: string | null;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    model?: string;
    timestamp: string;
}

export interface UsageTotals {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}

export interface UsageTotalsWithCost extends UsageTotals {
    estimated_cost_usd: number;
}

/** Preço USD por 1M tokens (input, output). Model id pode ser parcial (ex: "gemini" para qualquer gemini). */
const DEFAULT_PRICES: Record<string, { inputPerM: number; outputPerM: number }> = {
    'gemini-2.0-flash': { inputPerM: 0.10, outputPerM: 0.40 },
    'gemini-2.5-flash': { inputPerM: 0.15, outputPerM: 0.60 },
    'gemini-2.5-flash-lite': { inputPerM: 0.075, outputPerM: 0.30 },
    'gemini': { inputPerM: 0.15, outputPerM: 0.60 },
    'gpt-4o': { inputPerM: 2.50, outputPerM: 10.00 },
    'gpt-4o-mini': { inputPerM: 0.15, outputPerM: 0.60 },
    'gpt-4': { inputPerM: 2.00, outputPerM: 6.00 },
    'claude-3': { inputPerM: 3.00, outputPerM: 15.00 },
    'default': { inputPerM: 0.15, outputPerM: 0.60 },
};

function getPriceForModel(model?: string): { inputPerM: number; outputPerM: number } {
    if (!model || !model.trim()) return DEFAULT_PRICES.default;
    const key = Object.keys(DEFAULT_PRICES).find((k) => k !== 'default' && model.toLowerCase().includes(k));
    return key ? DEFAULT_PRICES[key] : DEFAULT_PRICES.default;
}

function costForRecord(r: TokenUsageRecord): number {
    const price = getPriceForModel(r.model);
    const inputCost = (r.prompt_tokens / 1_000_000) * price.inputPerM;
    const outputCost = (r.completion_tokens / 1_000_000) * price.outputPerM;
    return inputCost + outputCost;
}

const MAX_RECORDS = 100_000;
const records: TokenUsageRecord[] = [];

function createRecord(
    tenantId: string,
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number; model?: string },
    assistantId?: string | null
): TokenUsageRecord {
    return {
        tenantId,
        assistantId: assistantId ?? undefined,
        prompt_tokens: usage.prompt_tokens ?? 0,
        completion_tokens: usage.completion_tokens ?? 0,
        total_tokens: usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
        model: usage.model,
        timestamp: new Date().toISOString(),
    };
}

export const usageStore = {
    async record(
        tenantId: string,
        usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; model?: string },
        assistantId?: string | null
    ): Promise<void> {
        await recordUsage(tenantId, usage, assistantId);
        try {
            const r = createRecord(tenantId, {
                prompt_tokens: usage.prompt_tokens ?? 0,
                completion_tokens: usage.completion_tokens ?? 0,
                total_tokens: usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
                model: usage.model,
            }, assistantId);
            records.push(r);
            if (records.length > MAX_RECORDS) {
                records.splice(0, records.length - MAX_RECORDS);
            }
        } catch (err) {
            console.warn('[usageStore] Falha ao registrar uso:', (err as Error).message);
        }
    },

    async getTotals(tenantId: string, from?: string, to?: string, assistantId?: string | null): Promise<UsageTotals> {
        const persisted = await getUsageTotals(tenantId, from, to, assistantId);
        if (persisted) return persisted;

        const fromDate = from ? new Date(from).getTime() : 0;
        const toDate = to ? new Date(to).getTime() : Number.POSITIVE_INFINITY;
        let prompt_tokens = 0;
        let completion_tokens = 0;
        let total_tokens = 0;
        for (const r of records) {
            if (r.tenantId !== tenantId) continue;
            if (assistantId !== undefined && assistantId !== null && r.assistantId !== assistantId) continue;
            const t = new Date(r.timestamp).getTime();
            if (t < fromDate || t > toDate) continue;
            prompt_tokens += r.prompt_tokens;
            completion_tokens += r.completion_tokens;
            total_tokens += r.total_tokens;
        }
        return { prompt_tokens, completion_tokens, total_tokens };
    },

    async getTotalsWithCost(tenantId: string, from?: string, to?: string, assistantId?: string | null): Promise<UsageTotalsWithCost> {
        const persisted = await getUsageTotalsWithCost(tenantId, from, to, assistantId);
        if (persisted) return persisted;

        const fromDate = from ? new Date(from).getTime() : 0;
        const toDate = to ? new Date(to).getTime() : Number.POSITIVE_INFINITY;
        let prompt_tokens = 0;
        let completion_tokens = 0;
        let total_tokens = 0;
        let estimated_cost_usd = 0;
        for (const r of records) {
            if (r.tenantId !== tenantId) continue;
            if (assistantId !== undefined && assistantId !== null && r.assistantId !== assistantId) continue;
            const t = new Date(r.timestamp).getTime();
            if (t < fromDate || t > toDate) continue;
            prompt_tokens += r.prompt_tokens;
            completion_tokens += r.completion_tokens;
            total_tokens += r.total_tokens;
            estimated_cost_usd += costForRecord(r);
        }
        return { prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd };
    },

    /** Lista registros de uso com paginação (ordenado por timestamp decrescente). */
    async listRecords(
        tenantId: string,
        opts: { from?: string; to?: string; assistantId?: string | null; limit?: number; offset?: number }
    ): Promise<{ items: (TokenUsageRecord & { estimated_cost_usd: number })[]; total: number }> {
        const persisted = await listUsageRecords(tenantId, opts);
        if (persisted) return persisted;

        const fromDate = opts.from ? new Date(opts.from).getTime() : 0;
        const toDate = opts.to ? new Date(opts.to).getTime() : Number.POSITIVE_INFINITY;
        const limit = Math.min(100, Math.max(1, opts.limit ?? 10));
        const offset = Math.max(0, opts.offset ?? 0);

        const filtered: TokenUsageRecord[] = [];
        for (const r of records) {
            if (r.tenantId !== tenantId) continue;
            if (opts.assistantId !== undefined && opts.assistantId !== null && r.assistantId !== opts.assistantId) continue;
            const t = new Date(r.timestamp).getTime();
            if (t < fromDate || t > toDate) continue;
            filtered.push(r);
        }
        filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        const total = filtered.length;
        const slice = filtered.slice(offset, offset + limit);
        const items = slice.map((r) => ({
            ...r,
            estimated_cost_usd: costForRecord(r),
        }));
        return { items, total };
    },
};
