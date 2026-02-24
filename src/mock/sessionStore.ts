/**
 * Armazenamento de sessões de chat.
 * Implementação padrão: in-memory. Pode ser substituída por Redis, arquivo ou DB
 * sem alterar o consumidor (server.ts).
 */
import { OrderSession, createOrderSession } from '../core/ai/order-flow';
import { kv } from '@vercel/kv';

export interface ChatSession {
    history: any[];
    order: OrderSession;
    lastProduct: any | null;
}

export interface SessionStore {
    /** Chave lógica: tenantId + ':' + phone; com assistantId: tenantId + ':' + assistantId + ':' + phone. */
    get(tenantId: string, phone: string, assistantId?: string | null): Promise<ChatSession>;
    /** Opcional: para stores persistentes, persistir após alterações */
    set?(tenantId: string, phone: string, session: ChatSession, assistantId?: string | null): Promise<void>;
}

function createDefaultSession(): ChatSession {
    return {
        history: [],
        order: createOrderSession(),
        lastProduct: null,
    };
}

function sessionKey(tenantId: string, phone: string, assistantId?: string | null): string {
    const tid = tenantId || 'default';
    if (assistantId && assistantId.trim()) {
        return `${tid}:${assistantId.trim()}:${phone}`;
    }
    return `${tid}:${phone}`;
}

/**
 * Store em memória. Sessões são perdidas ao reiniciar o processo.
 * Sessões isoladas por tenant (M3) e por assistente (tenantId:assistantId:phone).
 */
export function createMemorySessionStore(): SessionStore {
    const sessions: Record<string, ChatSession> = {};
    return {
        async get(tenantId: string, phone: string, assistantId?: string | null): Promise<ChatSession> {
            const key = sessionKey(tenantId || 'default', phone, assistantId);
            if (!sessions[key]) {
                sessions[key] = createDefaultSession();
            }
            return sessions[key];
        },
        async set(tenantId: string, phone: string, session: ChatSession, assistantId?: string | null): Promise<void> {
            const key = sessionKey(tenantId || 'default', phone, assistantId);
            sessions[key] = session;
        },
    };
}

function isRedisConfigured(): boolean {
    return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export function createRedisSessionStore(ttlSeconds: number = 60 * 60 * 24): SessionStore {
    const memoryFallback = createMemorySessionStore();
    return {
        async get(tenantId: string, phone: string, assistantId?: string | null): Promise<ChatSession> {
            const key = sessionKey(tenantId || 'default', phone, assistantId);
            if (!isRedisConfigured()) return memoryFallback.get(tenantId, phone, assistantId);
            try {
                const found = await kv.get<ChatSession>(key);
                if (found && typeof found === 'object') return found;
                const created = createDefaultSession();
                await kv.set(key, created, { ex: ttlSeconds });
                return created;
            } catch (err) {
                console.warn('[sessionStore] Redis indisponível, usando memória:', (err as Error).message);
                return memoryFallback.get(tenantId, phone, assistantId);
            }
        },
        async set(tenantId: string, phone: string, session: ChatSession, assistantId?: string | null): Promise<void> {
            const key = sessionKey(tenantId || 'default', phone, assistantId);
            if (!isRedisConfigured()) {
                await memoryFallback.set?.(tenantId, phone, session, assistantId);
                return;
            }
            try {
                await kv.set(key, session, { ex: ttlSeconds });
            } catch (err) {
                console.warn('[sessionStore] Falha ao persistir no Redis, usando memória:', (err as Error).message);
                await memoryFallback.set?.(tenantId, phone, session, assistantId);
            }
        },
    };
}

/** Store singleton usado pelo servidor. */
export const sessionStore = isRedisConfigured() ? createRedisSessionStore() : createMemorySessionStore();

// ─── Agente atual por (tenantId, phone): após handoff, as próximas mensagens usam esse agente
const CURRENT_AGENT_KEY_PREFIX = 'current_agent:';
const currentAgentMemory: Record<string, string> = {};

function currentAgentKey(tenantId: string, phone: string): string {
    return `${CURRENT_AGENT_KEY_PREFIX}${tenantId || 'default'}:${phone}`;
}

export const currentAgentStore = {
    async get(tenantId: string, phone: string): Promise<string | null> {
        const key = currentAgentKey(tenantId, phone);
        if (isRedisConfigured()) {
            try {
                const v = await kv.get<string>(key);
                return typeof v === 'string' && v.trim() ? v.trim() : null;
            } catch {
                return currentAgentMemory[key]?.trim() ?? null;
            }
        }
        return currentAgentMemory[key]?.trim() ?? null;
    },
    async set(tenantId: string, phone: string, agentId: string): Promise<void> {
        const key = currentAgentKey(tenantId, phone);
        const value = (agentId || '').trim().toLowerCase();
        if (!value) return;
        currentAgentMemory[key] = value;
        if (isRedisConfigured()) {
            try {
                await kv.set(key, value, { ex: 60 * 60 * 24 }); // 24h
            } catch {
                /* keep memory */
            }
        }
    },
    async clear(tenantId: string, phone: string): Promise<void> {
        const key = currentAgentKey(tenantId, phone);
        delete currentAgentMemory[key];
        if (isRedisConfigured()) {
            try {
                await kv.del(key);
            } catch {
                /* ignore */
            }
        },
    },
};
