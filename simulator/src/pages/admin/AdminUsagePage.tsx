import { useState, useEffect } from 'react';
import axios from 'axios';
import { BarChart3, RefreshCw } from 'lucide-react';
import { getAdminHeaders, ADMIN_KEY_STORAGE } from './AdminKeyPage';

const API_BASE = import.meta.env.VITE_CHAT_API_URL || `http://localhost:${import.meta.env.VITE_API_PORT || '3001'}`;

type TenantUsage = {
    tenantId: string;
    companyName: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimated_cost_usd: number;
};

export default function AdminUsagePage() {
    const [tenants, setTenants] = useState<TenantUsage[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [from, setFrom] = useState(() => {
        const d = new Date();
        d.setDate(1);
        return d.toISOString().slice(0, 10);
    });
    const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

    const fetchUsage = () => {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams();
        if (from) params.set('from', `${from}T00:00:00.000Z`);
        if (to) params.set('to', `${to}T23:59:59.999Z`);
        axios
            .get(`${API_BASE}/api/admin/usage?${params}`, { headers: getAdminHeaders() })
            .then((res) => setTenants(res.data.tenants || []))
            .catch((err) => {
                if (err?.response?.status === 401) {
                    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
                    window.location.href = '/admin';
                    return;
                }
                setError(err?.response?.data?.error || 'Erro ao carregar consumo.');
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchUsage();
    }, []);

    const totalTokens = tenants.reduce((s, t) => s + t.total_tokens, 0);
    const totalCost = tenants.reduce((s, t) => s + t.estimated_cost_usd, 0);

    return (
        <div className="p-6 max-w-4xl">
            <h2 className="text-lg font-semibold text-[#111b21] dark:text-[#e9edef] mb-4 flex items-center gap-2">
                <BarChart3 size={22} />
                Consumo de tokens por empresa
            </h2>

            <p className="text-sm text-[#54656f] dark:text-[#aebac1] mb-4">
                Uso de tokens da IA e custo estimado (USD) por empresa. Valores baseados nos preços médios por modelo (OpenRouter).
            </p>

            <div className="flex flex-wrap items-end gap-2 mb-4">
                <div>
                    <label className="block text-xs text-[#54656f] dark:text-[#8696a0] mb-1">De</label>
                    <input
                        type="date"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                        className="rounded border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#2a3942] px-3 py-2 text-sm"
                    />
                </div>
                <div>
                    <label className="block text-xs text-[#54656f] dark:text-[#8696a0] mb-1">Até</label>
                    <input
                        type="date"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                        className="rounded border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#2a3942] px-3 py-2 text-sm"
                    />
                </div>
                <button
                    type="button"
                    onClick={fetchUsage}
                    disabled={loading}
                    className="flex items-center gap-2 rounded-lg bg-[#00a884] text-white px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    {loading ? 'Carregando…' : 'Atualizar'}
                </button>
            </div>

            {error && <p className="text-sm text-red-500 mb-4" role="alert">{error}</p>}

            {loading && tenants.length === 0 ? (
                <p className="text-[#54656f] dark:text-[#aebac1]">Carregando…</p>
            ) : (
                <>
                    <div className="rounded-lg border border-[#e9edef] dark:border-[#202c33] overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-[#f0f2f5] dark:bg-[#202c33] text-left">
                                <tr>
                                    <th className="px-3 py-2 font-medium text-[#54656f] dark:text-[#aebac1]">Empresa</th>
                                    <th className="px-3 py-2 font-medium text-[#54656f] dark:text-[#aebac1] text-right">Tokens entrada</th>
                                    <th className="px-3 py-2 font-medium text-[#54656f] dark:text-[#aebac1] text-right">Tokens saída</th>
                                    <th className="px-3 py-2 font-medium text-[#54656f] dark:text-[#aebac1] text-right">Total</th>
                                    <th className="px-3 py-2 font-medium text-[#54656f] dark:text-[#aebac1] text-right">Custo est. (USD)</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-[#111b21]">
                                {tenants.map((t) => (
                                    <tr key={t.tenantId} className="border-t border-[#e9edef] dark:border-[#2a3942]">
                                        <td className="px-3 py-2 text-[#111b21] dark:text-[#e9edef] font-medium">{t.companyName}</td>
                                        <td className="px-3 py-2 text-[#111b21] dark:text-[#e9edef] text-right">{t.prompt_tokens.toLocaleString('pt-BR')}</td>
                                        <td className="px-3 py-2 text-[#111b21] dark:text-[#e9edef] text-right">{t.completion_tokens.toLocaleString('pt-BR')}</td>
                                        <td className="px-3 py-2 text-[#111b21] dark:text-[#e9edef] text-right">{t.total_tokens.toLocaleString('pt-BR')}</td>
                                        <td className="px-3 py-2 text-[#111b21] dark:text-[#e9edef] text-right">${t.estimated_cost_usd.toFixed(4)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {tenants.length > 0 && (
                        <div className="mt-4 flex justify-end gap-6 text-sm font-medium text-[#111b21] dark:text-[#e9edef]">
                            <span>Total tokens: {totalTokens.toLocaleString('pt-BR')}</span>
                            <span>Custo total est.: ${totalCost.toFixed(4)} USD</span>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
