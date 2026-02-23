/**
 * Store de execuções:
 * - Primário: Postgres (quando POSTGRES_URL estiver configurada)
 * - Fallback: memória (dev/local)
 */
import { addExecution, getExecutionById, listExecutions, listExecutionsBySession } from '../db/repositories/executionRepository';

const MAX_ITEMS = 500;

export type ExecutionStatus = 'ok' | 'error';
export type ExecutionSource = 'api' | 'webhook';

export interface Execution {
    id: string;
    tenantId: string;
    /** ID do agente que atendeu esta mensagem (para timeline e transferências). */
    assistantId?: string | null;
    phone: string;
    message: string;
    reply: string;
    status: ExecutionStatus;
    durationMs: number;
    timestamp: string;
    source: ExecutionSource;
    debug?: unknown;
    /** Modelo de IA usado (ex.: openai/gpt-4). Preenchido quando a resposta veio da IA. */
    model?: string | null;
    /** Temperatura usada na chamada. Preenchido quando a resposta veio da IA. */
    temperature?: number | null;
}

export type ExecutionInput = Omit<Execution, 'id' | 'timestamp'>;

export interface ListOptions {
    limit?: number;
    offset?: number;
    phone?: string;
    tenantId?: string;
    source?: ExecutionSource;
    status?: ExecutionStatus;
}

export interface ListBySessionOptions {
    tenantId: string;
    phone: string;
    limit?: number;
}

export interface ListResult {
    items: Execution[];
    total: number;
}

const TRUNCATE_LEN = 80;

function truncate(s: string, maxLen: number = TRUNCATE_LEN): string {
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen) + '…';
}

function createStore() {
    const items: Execution[] = [];

    async function add(input: ExecutionInput): Promise<Execution> {
        const persisted = await addExecution(input);
        if (persisted) return persisted;

        const id = typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `exec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const timestamp = new Date().toISOString();
        const tenantId = (input.tenantId ?? '').trim() || 'default';
        const execution: Execution = {
            id,
            timestamp,
            tenantId,
            assistantId: input.assistantId ?? null,
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
        items.push(execution);
        while (items.length > MAX_ITEMS) {
            items.shift();
        }
        return execution;
    }

    async function list(options: ListOptions = {}): Promise<ListResult> {
        const persisted = await listExecutions(options);
        if (persisted) return persisted;

        const limit = Math.min(Math.max(0, options.limit ?? 50), 200);
        const offset = Math.max(0, options.offset ?? 0);
        let filtered = items;
        const tenantId = (options.tenantId ?? '').trim() || 'default';
        filtered = items.filter(e => e.tenantId === tenantId);
        if (options.phone && options.phone.trim() !== '') {
            const needle = options.phone.trim().toLowerCase();
            filtered = filtered.filter(e => e.phone.toLowerCase().includes(needle));
        }
        if (options.source) {
            filtered = filtered.filter((e) => e.source === options.source);
        }
        if (options.status) {
            filtered = filtered.filter((e) => e.status === options.status);
        }
        const total = filtered.length;
        const slice = filtered.slice(offset, offset + limit);
        const itemsSummarized = slice.map(e => ({
            ...e,
            message: truncate(e.message),
            reply: truncate(e.reply),
        }));
        return { items: itemsSummarized, total };
    }

    async function getById(id: string, tenantId?: string): Promise<Execution | null> {
        const persisted = await getExecutionById(id, tenantId);
        if (persisted) return persisted;

        const found = items.find(e => e.id === id) ?? null;
        if (found && tenantId !== undefined && tenantId.trim() !== '') {
            if (found.tenantId !== tenantId.trim()) return null;
        }
        return found;
    }

    async function listBySession(options: ListBySessionOptions): Promise<ListResult> {
        const persisted = await listExecutionsBySession(options);
        if (persisted) return persisted;

        const tenantId = (options.tenantId ?? '').trim() || 'default';
        const phone = (options.phone ?? '').trim();
        const limit = Math.min(Math.max(1, options.limit ?? 100), 200);
        let filtered = items.filter(e => e.tenantId === tenantId && e.phone === phone);
        filtered.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        const slice = filtered.slice(-limit);
        return { items: slice, total: filtered.length };
    }

    return { add, list, getById, listBySession };
}

const store = createStore();

export const executionStore = {
    add: store.add,
    list: store.list,
    getById: store.getById,
    listBySession: store.listBySession,
};
