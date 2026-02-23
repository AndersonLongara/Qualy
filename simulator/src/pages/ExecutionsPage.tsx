import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useTenant } from '../context/TenantContext';

const API_PORT = import.meta.env.VITE_API_PORT || '3001';
const API_BASE = import.meta.env.VITE_CHAT_API_URL || `http://localhost:${API_PORT}`;

type ExecutionItem = {
    id: string;
    phone: string;
    message: string;
    reply: string;
    status: string;
    durationMs: number;
    timestamp: string;
    source: string;
};

type ListResponse = {
    items: ExecutionItem[];
    total: number;
};

type ExecutionsPageProps = {
    source?: 'api' | 'webhook';
    title?: string;
};

export default function ExecutionsPage({ source, title }: ExecutionsPageProps) {
    const { tenantId } = useTenant();
    const [data, setData] = useState<ListResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [offset, setOffset] = useState(0);
    const [phoneFilter, setPhoneFilter] = useState('');
    const limit = 50;

    const fetchExecutions = (off: number, phone: string) => {
        setLoading(true);
        const params = new URLSearchParams({ limit: String(limit), offset: String(off) });
        if (phone.trim()) params.set('phone', phone.trim());
        if (source) params.set('source', source);
        params.set('tenant', tenantId || 'default');
        const headers = { 'X-Tenant-Id': tenantId || 'default' };
        axios
            .get(`${API_BASE}/api/executions?${params}`, { headers })
            .then((res) => {
                setData(res.data);
                setError(null);
            })
            .catch((err: any) => {
                const isNetworkError = err?.code === 'ERR_NETWORK' || !err?.response;
                setError(isNetworkError
                    ? `Não foi possível conectar à API. Verifique se o servidor está rodando (ex.: npm run dev na pasta do backend, porta ${API_PORT}).`
                    : 'Não foi possível carregar as execuções.');
            })
            .finally(() => setLoading(false));
    };

    const prevTenantRef = useRef(tenantId);
    useEffect(() => {
        const tenantChanged = prevTenantRef.current !== tenantId;
        if (tenantChanged) {
            prevTenantRef.current = tenantId;
            setOffset(0);
        }
        fetchExecutions(tenantChanged ? 0 : offset, phoneFilter);
    }, [tenantId, offset, phoneFilter, source]);

    const handleSearch = () => {
        setOffset(0);
        fetchExecutions(0, phoneFilter);
    };

    const formatDate = (iso: string) => {
        try {
            const d = new Date(iso);
            return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
        } catch {
            return iso;
        }
    };

    if (loading && !data) {
        return (
            <div className="p-4">
                <h1 className="text-xl font-semibold">{title || 'Execuções'}</h1>
                <p className="text-gray-500 dark:text-gray-400 mt-2">Carregando...</p>
            </div>
        );
    }

    if (error && !data) {
        return (
            <div className="p-4">
                <h1 className="text-xl font-semibold text-[#111b21] dark:text-[#e9edef]">{title || 'Execuções'}</h1>
                <p className="text-red-500 mt-2">{error}</p>
                <button
                    type="button"
                    onClick={() => { setError(null); setOffset(0); fetchExecutions(0, phoneFilter); }}
                    className="mt-3 text-sm text-[#00a884] hover:underline"
                >
                    Tentar novamente
                </button>
            </div>
        );
    }

    const items = data?.items ?? [];
    const total = data?.total ?? 0;
    const hasMore = offset + limit < total;

    return (
        <div className="w-full p-4 overflow-auto h-full">
            <h1 className="text-xl font-semibold text-[#111b21] dark:text-[#e9edef]">{title || 'Execuções'}</h1>
            <p className="text-sm text-[#54656f] dark:text-[#8696a0] mt-1">
                {source === 'webhook'
                    ? 'Exibindo execuções recebidas via webhook para a empresa selecionada.'
                    : 'Exibindo execuções da empresa selecionada no topo da página.'}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
                <input
                    type="text"
                    placeholder="Filtrar por phone"
                    value={phoneFilter}
                    onChange={(e) => setPhoneFilter(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="rounded border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#2a3942] px-3 py-2 text-sm w-48"
                />
                <button
                    type="button"
                    onClick={handleSearch}
                    className="rounded-lg bg-[#00a884] text-white px-3 py-2 text-sm font-medium hover:opacity-90"
                >
                    Buscar
                </button>
            </div>

            <div className="mt-4 rounded-lg border border-[#e9edef] dark:border-[#202c33] overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-[#f0f2f5] dark:bg-[#202c33] text-left">
                            <tr>
                                <th className="px-3 py-2 font-medium text-[#54656f] dark:text-[#aebac1]">Data/Hora</th>
                                <th className="px-3 py-2 font-medium text-[#54656f] dark:text-[#aebac1]">Phone</th>
                                <th className="px-3 py-2 font-medium text-[#54656f] dark:text-[#aebac1]">Mensagem</th>
                                <th className="px-3 py-2 font-medium text-[#54656f] dark:text-[#aebac1]">Resposta</th>
                                <th className="px-3 py-2 font-medium text-[#54656f] dark:text-[#aebac1]">Status</th>
                                <th className="px-3 py-2 font-medium text-[#54656f] dark:text-[#aebac1]">Duração (ms)</th>
                                <th className="px-3 py-2 font-medium text-[#54656f] dark:text-[#aebac1]">Origem</th>
                                <th className="px-3 py-2 font-medium text-[#54656f] dark:text-[#aebac1]">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-[#111b21]">
                            {items.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-3 py-6 text-center text-[#54656f] dark:text-[#8696a0]">
                                        Nenhuma execução encontrada.
                                    </td>
                                </tr>
                            ) : (
                                items.map((exec) => (
                                    <tr key={exec.id} className="border-t border-[#e9edef] dark:border-[#2a3942] hover:bg-[#f0f2f5] dark:hover:bg-[#2a3942]">
                                        <td className="px-3 py-2 text-[#111b21] dark:text-[#e9edef] whitespace-nowrap">
                                            {formatDate(exec.timestamp)}
                                        </td>
                                        <td className="px-3 py-2 text-[#111b21] dark:text-[#e9edef] font-mono text-xs">
                                            {exec.phone}
                                        </td>
                                        <td className="px-3 py-2 text-[#111b21] dark:text-[#e9edef] max-w-[180px] truncate" title={exec.message}>
                                            {exec.message}
                                        </td>
                                        <td className="px-3 py-2 text-[#111b21] dark:text-[#e9edef] max-w-[180px] truncate" title={exec.reply}>
                                            {exec.reply}
                                        </td>
                                        <td className="px-3 py-2">
                                            <span
                                                className={
                                                    exec.status === 'ok'
                                                        ? 'text-green-600 dark:text-green-400'
                                                        : 'text-red-600 dark:text-red-400'
                                                }
                                            >
                                                {exec.status}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-[#111b21] dark:text-[#e9edef]">{exec.durationMs}</td>
                                        <td className="px-3 py-2 text-[#111b21] dark:text-[#e9edef]">{exec.source}</td>
                                        <td className="px-3 py-2">
                                            <Link
                                                to={`/empresas/execucoes/${exec.id}`}
                                                className="text-[#00a884] hover:underline text-xs font-medium"
                                            >
                                                Ver
                                            </Link>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {total > 0 && (
                <div className="mt-4 flex items-center gap-4 text-sm text-[#54656f] dark:text-[#8696a0]">
                    <span>
                        {offset + 1}–{Math.min(offset + limit, total)} de {total}
                    </span>
                    {offset > 0 && (
                        <button
                            type="button"
                            onClick={() => setOffset((o) => Math.max(0, o - limit))}
                            className="text-[#00a884] hover:underline"
                        >
                            Anterior
                        </button>
                    )}
                    {hasMore && (
                        <button
                            type="button"
                            onClick={() => setOffset((o) => o + limit)}
                            className="text-[#00a884] hover:underline"
                        >
                            Próxima
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
