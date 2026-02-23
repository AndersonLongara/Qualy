/**
 * Conversa estruturada por sessão (tenant + phone): timeline de mensagens com eventos de transferência entre agentes.
 */
import { useState, useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, MessageCircle, User, GitBranch } from 'lucide-react';
import { useTenant } from '../../context/TenantContext';
import { getAdminHeaders } from '../admin/AdminKeyPage';

const API_BASE = import.meta.env.VITE_CHAT_API_URL || `http://localhost:${import.meta.env.VITE_API_PORT || '3001'}`;
const BASE = '/empresas';

type ExecutionItem = {
    id: string;
    tenantId: string;
    assistantId?: string | null;
    phone: string;
    message: string;
    reply: string;
    status: string;
    durationMs: number;
    timestamp: string;
    source: string;
    debug?: { handoff?: { targetAgentId: string; transitionMessage?: string } };
};

function formatTime(iso: string): string {
    try {
        return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
        return iso;
    }
}

export default function ConversationTimelinePage() {
    const { id: companyId } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const phoneFromQuery = searchParams.get('phone') ?? '';
    const { tenantId: contextTenant } = useTenant();
    const tenantId = companyId ?? contextTenant ?? 'default';

    const [phone, setPhone] = useState(phoneFromQuery);
    const [items, setItems] = useState<ExecutionItem[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [companyName, setCompanyName] = useState<string>(companyId ?? '');

    const loadSession = (phoneValue: string) => {
        if (!phoneValue.trim()) {
            setItems([]);
            setTotal(0);
            return;
        }
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({ phone: phoneValue.trim(), limit: '100' });
        const headers = { 'X-Tenant-Id': tenantId };
        axios
            .get<{ items: ExecutionItem[]; total: number }>(`${API_BASE}/api/executions/by-session?${params}`, { headers })
            .then((res) => {
                setItems(res.data.items ?? []);
                setTotal(res.data.total ?? 0);
            })
            .catch(() => {
                setError('Não foi possível carregar a conversa.');
                setItems([]);
                setTotal(0);
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (phoneFromQuery) {
            setPhone(phoneFromQuery);
            loadSession(phoneFromQuery);
        }
    }, [phoneFromQuery, tenantId]);

    useEffect(() => {
        if (companyId) {
            axios
                .get(`${API_BASE}/api/admin/tenants/${encodeURIComponent(companyId)}`, { headers: getAdminHeaders() })
                .then((res) => {
                    const name = res.data?.branding?.companyName;
                    if (name) setCompanyName(name);
                })
                .catch(() => {});
        }
    }, [companyId]);

    const handoffFromDebug = (debug: ExecutionItem['debug']) => {
        if (!debug || typeof debug !== 'object' || Array.isArray(debug)) return null;
        const d = debug as Record<string, unknown>;
        const h = d.handoff;
        if (h && typeof h === 'object' && h !== null && 'targetAgentId' in h) return h as { targetAgentId: string; transitionMessage?: string };
        return null;
    };

    return (
        <div>
            <div className="flex items-center gap-4 mb-6">
                <Link to={companyId ? `${BASE}/${companyId}` : BASE} className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 text-[#54656f] dark:text-[#aebac1]">
                    <ArrowLeft size={20} />
                </Link>
                <div>
                    <h1 className="text-xl font-semibold text-[#111b21] dark:text-[#e9edef]">Conversa (timeline)</h1>
                    <p className="text-sm text-[#54656f] dark:text-[#aebac1]">{companyName || tenantId}</p>
                </div>
            </div>

            <div className="rounded-xl border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#202c33] p-4 mb-4">
                <label className="block text-sm font-medium text-[#111b21] dark:text-[#e9edef] mb-2">Sessão (phone / identificador)</label>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && loadSession(phone)}
                        placeholder="Ex.: 5511999999999 ou session-id"
                        className="flex-1 px-3 py-2 rounded-md border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#2a3942] text-[#111b21] dark:text-[#e9edef]"
                    />
                    <button
                        type="button"
                        onClick={() => loadSession(phone)}
                        disabled={loading || !phone.trim()}
                        className="px-4 py-2 rounded-md bg-[#00a884] text-white hover:bg-[#00a884]/90 disabled:opacity-50 text-sm font-medium"
                    >
                        {loading ? 'Carregando…' : 'Carregar'}
                    </button>
                </div>
            </div>

            {error && <p className="mb-4 text-sm text-red-500" role="alert">{error}</p>}

            {items.length === 0 && !loading && (
                <p className="text-[#54656f] dark:text-[#aebac1] text-sm">Informe o phone e clique em Carregar para ver a conversa estruturada com transferências.</p>
            )}

            {items.length > 0 && (
                <div className="space-y-4">
                    <p className="text-sm text-[#54656f] dark:text-[#aebac1]">{total} mensagem(ns) na sessão</p>
                    <div className="space-y-3">
                        {items.map((exec) => {
                            const handoff = handoffFromDebug(exec.debug);
                            return (
                                <div key={exec.id} className="space-y-2">
                                    <div className="flex gap-3">
                                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#d9fdd3] dark:bg-[#005c4b] flex items-center justify-center">
                                            <User size={16} className="text-[#0b0b0b] dark:text-[#e9edef]" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-[#54656f] dark:text-[#8696a0] mb-0.5">{formatTime(exec.timestamp)} · Agente: {exec.assistantId ?? '—'}</p>
                                            <div className="rounded-lg px-3 py-2 bg-[#f0f2f5] dark:bg-[#2a3942] text-sm text-[#111b21] dark:text-[#e9edef] whitespace-pre-wrap break-words">
                                                {exec.message}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-3 pl-11">
                                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#e9edef] dark:bg-[#3b4a54] flex items-center justify-center">
                                            <MessageCircle size={16} className="text-[#54656f] dark:text-[#aebac1]" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="rounded-lg px-3 py-2 bg-white dark:bg-[#111b21] border border-[#e9edef] dark:border-[#2a3942] text-sm text-[#111b21] dark:text-[#e9edef] whitespace-pre-wrap break-words">
                                                {exec.reply}
                                            </div>
                                        </div>
                                    </div>
                                    {handoff && (
                                        <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-[#00a884]/10 dark:bg-[#00a884]/20 border border-[#00a884]/30 ml-11">
                                            <GitBranch size={18} className="text-[#00a884] flex-shrink-0" />
                                            <div className="text-sm">
                                                <span className="font-medium text-[#0d9488] dark:text-[#2dd4bf]">Transferência para o agente: {handoff.targetAgentId}</span>
                                                {handoff.transitionMessage && (
                                                    <p className="text-[#54656f] dark:text-[#8696a0] mt-0.5">{handoff.transitionMessage}</p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
