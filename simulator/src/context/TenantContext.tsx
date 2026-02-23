import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import axios from 'axios';

const API_PORT = import.meta.env.VITE_API_PORT || '3001';
const API_BASE = import.meta.env.VITE_CHAT_API_URL || `http://localhost:${API_PORT}`;

export const TENANT_STORAGE_KEY = 'altraflow_current_tenant_id';
const ADMIN_KEY_STORAGE = 'altraflow_admin_key';

export type TenantOption = { id: string; companyName?: string };

type TenantContextValue = {
    tenantId: string;
    setTenantId: (id: string) => void;
    tenants: TenantOption[];
    loading: boolean;
    error: string | null;
    refetchTenants: () => void;
};

const TenantContext = createContext<TenantContextValue | null>(null);

function applyTenantsList(
    list: TenantOption[],
    setTenants: (v: TenantOption[] | ((prev: TenantOption[]) => TenantOption[])) => void,
    setTenantIdState: (fn: (current: string) => string) => void
) {
    const listOrDefault = list.length > 0 ? list : [{ id: 'default', companyName: 'Default' }];
    setTenants(listOrDefault);
    setTenantIdState((current) => {
        const exists = listOrDefault.some((t) => t.id === current);
        if (!exists && listOrDefault.length > 0) {
            const fallback = listOrDefault[0].id;
            try {
                sessionStorage.setItem(TENANT_STORAGE_KEY, fallback);
            } catch {}
            return fallback;
        }
        return current;
    });
}

export function TenantProvider({ children }: { children: ReactNode }) {
    const [tenantId, setTenantIdState] = useState<string>(() => {
        try {
            return sessionStorage.getItem(TENANT_STORAGE_KEY)?.trim() || 'default';
        } catch {
            return 'default';
        }
    });
    const [tenants, setTenants] = useState<TenantOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchTenants = useCallback(() => {
        setLoading(true);
        setError(null);
        const adminKey = sessionStorage.getItem(ADMIN_KEY_STORAGE)?.trim();
        const tryAdmin = (): Promise<TenantOption[]> =>
            adminKey
                ? axios
                      .get<{ tenants: string[] }>(`${API_BASE}/api/admin/tenants`, { headers: { 'X-Admin-Key': adminKey } })
                      .then((r) => (r.data?.tenants ?? []).map((id) => ({ id, companyName: id })))
                : Promise.resolve([]);

        axios
            .get<{ tenants: TenantOption[] }>(`${API_BASE}/api/tenants`)
            .then((res) => {
                const list = res.data?.tenants ?? [];
                if (list.length > 0) return list;
                return tryAdmin();
            })
            .catch(() => tryAdmin())
            .then((list) => {
                if (list.length > 0) setError(null);
                else setError('Erro ao carregar empresas. Use "Tentar novamente" ou acesse Admin.');
                applyTenantsList(list, setTenants, setTenantIdState);
            })
            .catch((err: unknown) => {
                setError(err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : 'Erro ao carregar empresas.');
                setTenants([{ id: 'default', companyName: 'Default' }]);
            })
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetchTenants();
    }, [fetchTenants]);

    useEffect(() => {
        const onVisibility = () => { if (document.visibilityState === 'visible') fetchTenants(); };
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, [fetchTenants]);

    const setTenantId = useCallback((id: string) => {
        const next = (id ?? '').trim() || 'default';
        setTenantIdState(next);
        try {
            sessionStorage.setItem(TENANT_STORAGE_KEY, next);
        } catch {}
    }, []);

    const value: TenantContextValue = {
        tenantId,
        setTenantId,
        tenants,
        loading,
        error,
        refetchTenants: fetchTenants,
    };

    return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue {
    const ctx = useContext(TenantContext);
    if (!ctx) {
        throw new Error('useTenant must be used within TenantProvider');
    }
    return ctx;
}
