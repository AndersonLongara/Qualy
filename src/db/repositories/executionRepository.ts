import { and, asc, desc, eq, ilike, sql } from 'drizzle-orm';
import { getDb, isDbEnabled } from '../client';
import { executions } from '../schema';
import type { Execution, ExecutionInput, ListBySessionOptions, ListOptions, ListResult, SessionSummary, ListSessionsResult } from '../../mock/executionStore';

export async function addExecution(input: ExecutionInput): Promise<Execution | null> {
    if (!isDbEnabled()) return null;
    const db = getDb();
    const id = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `exec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const timestamp = new Date().toISOString();
    const tenantId = (input.tenantId ?? '').trim() || 'default';
    await db.insert(executions).values({
        id,
        tenantId,
        assistantId: (input.assistantId ?? '').trim() || null,
        phone: input.phone,
        message: input.message,
        reply: input.reply,
        status: input.status,
        durationMs: input.durationMs,
        timestamp: new Date(timestamp),
        source: input.source,
        debug: input.debug as any,
        model: input.model ?? null,
        temperature: input.temperature ?? null,
    });
    return {
        id,
        timestamp,
        tenantId,
        assistantId: (input.assistantId ?? '').trim() || null,
        phone: input.phone,
        message: input.message,
        reply: input.reply,
        status: input.status,
        durationMs: input.durationMs,
        source: input.source,
        debug: input.debug,
        model: input.model,
        temperature: input.temperature,
    };
}

export async function listExecutions(options: ListOptions = {}): Promise<ListResult | null> {
    if (!isDbEnabled()) return null;
    const db = getDb();
    const limit = Math.min(Math.max(0, options.limit ?? 50), 200);
    const offset = Math.max(0, options.offset ?? 0);
    const tenantId = (options.tenantId ?? '').trim() || 'default';

    const where = and(
        eq(executions.tenantId, tenantId),
        options.phone && options.phone.trim() !== '' ? ilike(executions.phone, `%${options.phone.trim()}%`) : undefined,
        options.source ? eq(executions.source, options.source) : undefined,
        options.status ? eq(executions.status, options.status) : undefined
    );

    const totalRows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(executions)
        .where(where);
    const rows = await db
        .select()
        .from(executions)
        .where(where)
        .orderBy(desc(executions.timestamp))
        .limit(limit)
        .offset(offset);

    const items: Execution[] = rows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        assistantId: r.assistantId ?? null,
        phone: r.phone,
        message: r.message.length > 80 ? `${r.message.slice(0, 80)}…` : r.message,
        reply: r.reply.length > 80 ? `${r.reply.slice(0, 80)}…` : r.reply,
        status: r.status as Execution['status'],
        durationMs: r.durationMs,
        timestamp: (r.timestamp instanceof Date ? r.timestamp : new Date(r.timestamp)).toISOString(),
        source: r.source as Execution['source'],
        debug: r.debug ?? undefined,
        model: r.model ?? null,
        temperature: r.temperature ?? null,
    }));
    return { items, total: totalRows[0]?.count ?? 0 };
}

export async function listExecutionsBySession(options: ListBySessionOptions): Promise<ListResult | null> {
    if (!isDbEnabled()) return null;
    const db = getDb();
    const tenantId = (options.tenantId ?? '').trim() || 'default';
    const phone = (options.phone ?? '').trim();
    if (!phone) return { items: [], total: 0 };
    const limit = Math.min(Math.max(1, options.limit ?? 100), 200);
    const where = and(eq(executions.tenantId, tenantId), eq(executions.phone, phone));
    const totalRows = await db.select({ count: sql<number>`count(*)::int` }).from(executions).where(where);
    const rows = await db
        .select()
        .from(executions)
        .where(where)
        .orderBy(asc(executions.timestamp))
        .limit(limit);
    const items: Execution[] = rows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        assistantId: r.assistantId ?? null,
        phone: r.phone,
        message: r.message,
        reply: r.reply,
        status: r.status as Execution['status'],
        durationMs: r.durationMs,
        timestamp: (r.timestamp instanceof Date ? r.timestamp : new Date(r.timestamp)).toISOString(),
        source: r.source as Execution['source'],
        debug: r.debug ?? undefined,
        model: r.model ?? null,
        temperature: r.temperature ?? null,
    }));
    return { items, total: totalRows[0]?.count ?? 0 };
}

export async function getExecutionById(id: string, tenantId?: string): Promise<Execution | null> {
    if (!isDbEnabled()) return null;
    const db = getDb();
    const rows = await db
        .select()
        .from(executions)
        .where(and(
            eq(executions.id, id),
            tenantId && tenantId.trim() ? eq(executions.tenantId, tenantId.trim()) : undefined
        ))
        .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
        id: r.id,
        tenantId: r.tenantId,
        assistantId: r.assistantId ?? null,
        phone: r.phone,
        message: r.message,
        reply: r.reply,
        status: r.status as Execution['status'],
        durationMs: r.durationMs,
        timestamp: (r.timestamp instanceof Date ? r.timestamp : new Date(r.timestamp)).toISOString(),
        source: r.source as Execution['source'],
        debug: r.debug ?? undefined,
        model: r.model ?? null,
        temperature: r.temperature ?? null,
    };
}

const SESSION_PREVIEW_LEN = 80;

export interface ListSessionsOptions {
    tenantId: string;
    limit?: number;
    offset?: number;
}

export async function listSessions(options: ListSessionsOptions): Promise<ListSessionsResult | null> {
    if (!isDbEnabled()) return null;
    const db = getDb();
    const tenantId = (options.tenantId ?? '').trim() || 'default';
    const limit = Math.min(200, Math.max(1, options.limit ?? 50));
    const offset = Math.max(0, options.offset ?? 0);

    const allForTenant = await db
        .select({
            phone: executions.phone,
            timestamp: executions.timestamp,
            reply: executions.reply,
        })
        .from(executions)
        .where(eq(executions.tenantId, tenantId))
        .orderBy(desc(executions.timestamp))
        .limit(3000);

    const byPhone = new Map<string, { lastMessageAt: Date; messageCount: number; lastPreview: string }>();
    for (const row of allForTenant) {
        const key = row.phone;
        if (!byPhone.has(key)) {
            byPhone.set(key, {
                lastMessageAt: row.timestamp instanceof Date ? row.timestamp : new Date(row.timestamp),
                messageCount: 0,
                lastPreview: row.reply?.length > SESSION_PREVIEW_LEN ? row.reply.slice(0, SESSION_PREVIEW_LEN) + '…' : (row.reply ?? ''),
            });
        }
        const ent = byPhone.get(key)!;
        ent.messageCount += 1;
    }

    const sorted = Array.from(byPhone.entries())
        .map(([phone, v]) => ({ phone, lastMessageAt: v.lastMessageAt.toISOString(), messageCount: v.messageCount, lastPreview: v.lastPreview }))
        .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
    const total = sorted.length;
    const items = sorted.slice(offset, offset + limit);

    return { items, total };
}
