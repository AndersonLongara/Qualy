import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb, isDbEnabled } from '../client';
import { usageRecords } from '../schema';
import type { TokenUsageRecord, UsageTotals, UsageTotalsWithCost } from '../../mock/usageStore';

const DEFAULT_PRICES: Record<string, { inputPerM: number; outputPerM: number }> = {
    'gemini-2.0-flash': { inputPerM: 0.10, outputPerM: 0.40 },
    'gemini-2.5-flash': { inputPerM: 0.15, outputPerM: 0.60 },
    'gemini-2.5-flash-lite': { inputPerM: 0.075, outputPerM: 0.30 },
    gemini: { inputPerM: 0.15, outputPerM: 0.60 },
    'gpt-4o': { inputPerM: 2.50, outputPerM: 10.00 },
    'gpt-4o-mini': { inputPerM: 0.15, outputPerM: 0.60 },
    'gpt-4': { inputPerM: 2.00, outputPerM: 6.00 },
    'claude-3': { inputPerM: 3.00, outputPerM: 15.00 },
    default: { inputPerM: 0.15, outputPerM: 0.60 },
};

export function costForRecord(r: Pick<TokenUsageRecord, 'prompt_tokens' | 'completion_tokens' | 'model'>): number {
    const key = Object.keys(DEFAULT_PRICES).find((k) => k !== 'default' && (r.model || '').toLowerCase().includes(k));
    const price = key ? DEFAULT_PRICES[key] : DEFAULT_PRICES.default;
    const inputCost = (r.prompt_tokens / 1_000_000) * price.inputPerM;
    const outputCost = (r.completion_tokens / 1_000_000) * price.outputPerM;
    return inputCost + outputCost;
}

function dateRange(from?: string, to?: string) {
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    return and(
        fromDate ? sql`${usageRecords.timestamp} >= ${fromDate}` : undefined,
        toDate ? sql`${usageRecords.timestamp} <= ${toDate}` : undefined
    );
}

export async function recordUsage(
    tenantId: string,
    usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; model?: string },
    assistantId?: string | null
): Promise<void> {
    if (!isDbEnabled()) return;
    const db = getDb();
    await db.insert(usageRecords).values({
        tenantId,
        assistantId: assistantId ?? null,
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
        totalTokens: usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
        model: usage.model ?? null,
        timestamp: new Date(),
    });
}

export async function getUsageTotals(
    tenantId: string,
    from?: string,
    to?: string,
    assistantId?: string | null
): Promise<UsageTotals | null> {
    if (!isDbEnabled()) return null;
    const db = getDb();
    const where = and(
        eq(usageRecords.tenantId, tenantId),
        assistantId !== undefined && assistantId !== null ? eq(usageRecords.assistantId, assistantId) : undefined,
        dateRange(from, to)
    );
    const rows = await db
        .select({
            prompt_tokens: sql<number>`coalesce(sum(${usageRecords.promptTokens}), 0)::int`,
            completion_tokens: sql<number>`coalesce(sum(${usageRecords.completionTokens}), 0)::int`,
            total_tokens: sql<number>`coalesce(sum(${usageRecords.totalTokens}), 0)::int`,
        })
        .from(usageRecords)
        .where(where);
    return rows[0] ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
}

export async function getUsageTotalsWithCost(
    tenantId: string,
    from?: string,
    to?: string,
    assistantId?: string | null
): Promise<UsageTotalsWithCost | null> {
    if (!isDbEnabled()) return null;
    const db = getDb();
    const where = and(
        eq(usageRecords.tenantId, tenantId),
        assistantId !== undefined && assistantId !== null ? eq(usageRecords.assistantId, assistantId) : undefined,
        dateRange(from, to)
    );
    const rows = await db
        .select({
            prompt_tokens: usageRecords.promptTokens,
            completion_tokens: usageRecords.completionTokens,
            total_tokens: usageRecords.totalTokens,
            model: usageRecords.model,
        })
        .from(usageRecords)
        .where(where);
    let prompt_tokens = 0;
    let completion_tokens = 0;
    let total_tokens = 0;
    let estimated_cost_usd = 0;
    for (const r of rows) {
        prompt_tokens += r.prompt_tokens;
        completion_tokens += r.completion_tokens;
        total_tokens += r.total_tokens;
        estimated_cost_usd += costForRecord({
            prompt_tokens: r.prompt_tokens,
            completion_tokens: r.completion_tokens,
            model: r.model ?? undefined,
        });
    }
    return { prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd };
}

export async function listUsageRecords(
    tenantId: string,
    opts: { from?: string; to?: string; assistantId?: string | null; limit?: number; offset?: number }
): Promise<{ items: (TokenUsageRecord & { estimated_cost_usd: number })[]; total: number } | null> {
    if (!isDbEnabled()) return null;
    const db = getDb();
    const limit = Math.min(100, Math.max(1, opts.limit ?? 10));
    const offset = Math.max(0, opts.offset ?? 0);
    const where = and(
        eq(usageRecords.tenantId, tenantId),
        opts.assistantId !== undefined && opts.assistantId !== null ? eq(usageRecords.assistantId, opts.assistantId) : undefined,
        dateRange(opts.from, opts.to)
    );
    const totalRows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(usageRecords)
        .where(where);
    const rows = await db
        .select()
        .from(usageRecords)
        .where(where)
        .orderBy(desc(usageRecords.timestamp))
        .limit(limit)
        .offset(offset);
    const items = rows.map((r) => ({
        tenantId: r.tenantId,
        assistantId: r.assistantId,
        prompt_tokens: r.promptTokens,
        completion_tokens: r.completionTokens,
        total_tokens: r.totalTokens,
        model: r.model ?? undefined,
        timestamp: (r.timestamp instanceof Date ? r.timestamp : new Date(r.timestamp)).toISOString(),
        estimated_cost_usd: costForRecord({
            prompt_tokens: r.promptTokens,
            completion_tokens: r.completionTokens,
            model: r.model ?? undefined,
        }),
    }));
    return { items, total: totalRows[0]?.count ?? 0 };
}
