/**
 * Dentro da empresa: visão dos agentes em cards + opção de criar novo agente.
 */
import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Plus, MessageCircle, ChevronRight, ArrowLeft, Settings, Wrench, ExternalLink } from 'lucide-react';
import { getAdminHeaders, ADMIN_KEY_STORAGE } from '../admin/AdminKeyPage';

const API_BASE = import.meta.env.VITE_CHAT_API_URL || `http://localhost:${import.meta.env.VITE_API_PORT || '3001'}`;

type AssistantConfig = {
    id: string;
    name: string;
    systemPromptPath?: string | null;
    systemPrompt?: string | null;
    model?: string | null;
    temperature?: number | null;
};

type TenantConfig = {
    branding: { companyName: string; assistantName: string; productName?: string };
    assistants?: AssistantConfig[];
};

const BASE = '/empresas';

export default function CompanyAgentsPage() {
    const { id: companyId } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [config, setConfig] = useState<TenantConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!companyId || companyId === 'new') {
            navigate(BASE, { replace: true });
            return;
        }
        setError(null);
        axios
            .get<TenantConfig>(`${API_BASE}/api/admin/tenants/${encodeURIComponent(companyId)}`, { headers: getAdminHeaders() })
            .then((res) => {
                const c = res?.data;
                if (c && typeof c === 'object') setConfig(c as TenantConfig);
                else setError('Resposta inválida do servidor.');
            })
            .catch((err) => {
                if (err?.response?.status === 401) {
                    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
                    navigate(BASE, { replace: true });
                    return;
                }
                if (err?.response?.status === 404) setError('Empresa não encontrada.');
                else setError(err?.response?.data?.error || 'Erro ao carregar empresa.');
            })
            .finally(() => setLoading(false));
    }, [companyId, navigate]);

    if (loading) {
        return (
            <div className="py-8">
                <p className="text-[#54656f] dark:text-[#aebac1]">Carregando agentes…</p>
            </div>
        );
    }

    if (error || !config) {
        return (
            <div className="py-8">
                <p className="text-red-500">{error || 'Empresa não encontrada.'}</p>
                <Link to={BASE} className="mt-2 inline-block text-sm text-[#00a884] hover:underline">Voltar às empresas</Link>
            </div>
        );
    }

    const assistants = Array.isArray(config.assistants) ? config.assistants.filter((a) => a.id?.trim() && a.name?.trim()) : [];
    const companyName = config.branding?.companyName || companyId;

    return (
        <div>
            <div className="flex items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-4">
                    <Link
                        to={BASE}
                        className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 text-[#54656f] dark:text-[#aebac1]"
                    >
                        <ArrowLeft size={20} />
                    </Link>
                    <div>
                        <h1 className="text-xl font-semibold text-[#111b21] dark:text-[#e9edef]">{companyName}</h1>
                        <p className="text-sm text-[#54656f] dark:text-[#aebac1]">Agentes desta empresa</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Link
                        to={`${BASE}/${encodeURIComponent(companyId!)}/tools`}
                        className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5 hover:text-[#00a884]"
                    >
                        <Wrench size={18} />
                        Ferramentas
                    </Link>
                    <Link
                        to={`${BASE}/${encodeURIComponent(companyId!)}/preview`}
                        className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-[#00a884] hover:bg-[#00a884]/10 dark:hover:bg-[#00a884]/20"
                    >
                        <MessageCircle size={18} />
                        Chat preview geral
                    </Link>
                    <Link
                        to={`${BASE}/${encodeURIComponent(companyId!)}/editar`}
                        className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5 hover:text-[#00a884]"
                    >
                        <Settings size={18} />
                        Editar empresa
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {assistants.map((a) => (
                    <div
                        key={a.id}
                        className="group flex flex-col rounded-xl border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#202c33] p-5 shadow-sm hover:shadow-md hover:border-[#00a884]/40 dark:hover:border-[#00a884]/50 transition-all duration-200"
                    >
                        <Link
                            to={`${BASE}/agentes/${encodeURIComponent(companyId!)}/${encodeURIComponent(a.id)}`}
                            className="flex items-start gap-4"
                        >
                            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-[#00a884]/10 dark:bg-[#00a884]/20 flex items-center justify-center">
                                <MessageCircle size={24} className="text-[#00a884]" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h3 className="font-semibold text-[#111b21] dark:text-[#e9edef] truncate group-hover:text-[#00a884] transition-colors">
                                    {a.name || a.id}
                                </h3>
                                <p className="text-xs text-[#54656f] dark:text-[#8696a0] mt-0.5">ID: {a.id}</p>
                            </div>
                            <ChevronRight size={20} className="flex-shrink-0 text-[#8696a0] group-hover:text-[#00a884] group-hover:translate-x-0.5 transition-all" />
                        </Link>
                        <div className="mt-4 pt-4 border-t border-[#e9edef] dark:border-[#2a3942] flex items-center justify-between gap-2">
                            <Link
                                to={`${BASE}/agentes/${encodeURIComponent(companyId!)}/${encodeURIComponent(a.id)}`}
                                className="text-sm font-medium text-[#00a884] hover:underline"
                            >
                                Configurações, chat, execuções e consumo
                            </Link>
                            <Link
                                to={`${BASE}/agentes/${encodeURIComponent(companyId!)}/${encodeURIComponent(a.id)}?tab=chat`}
                                className="text-sm font-medium text-[#00a884] hover:underline shrink-0"
                            >
                                Abrir chat
                            </Link>
                        </div>
                    </div>
                ))}

                <Link
                    to={`${BASE}/${encodeURIComponent(companyId!)}/agentes/new`}
                    className="flex flex-col items-center justify-center min-h-[140px] rounded-xl border-2 border-dashed border-[#00a884] bg-[#00a884]/5 dark:bg-[#00a884]/10 text-[#00a884] hover:bg-[#00a884]/10 dark:hover:bg-[#00a884]/20 hover:border-[#00a884] transition-all duration-200"
                >
                    <div className="w-12 h-12 rounded-xl border-2 border-dashed border-[#00a884] flex items-center justify-center mb-3">
                        <Plus size={24} />
                    </div>
                    <span className="font-medium">Novo agente</span>
                    <span className="text-xs mt-1 opacity-90">Criar assistente</span>
                </Link>
            </div>

            {assistants.length === 0 && (
                <p className="mt-4 text-[#54656f] dark:text-[#aebac1] text-sm">Nenhum agente. Use o card acima para criar o primeiro.</p>
            )}

            {assistants.length > 0 && (
                <div className="mt-6 p-4 rounded-lg border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#202c33]">
                    <h3 className="text-sm font-semibold text-[#111b21] dark:text-[#e9edef] mb-2">Link público do chat</h3>
                    <p className="text-xs text-[#54656f] dark:text-[#aebac1] mb-2">Compartilhe este link para que clientes testem o chat com o fluxo configurado.</p>
                    <div className="flex items-center gap-2">
                        <code className="flex-1 text-sm bg-[#f0f2f5] dark:bg-[#111b21] text-[#111b21] dark:text-[#e9edef] px-3 py-2 rounded-md border border-[#e9edef] dark:border-[#2a3942] truncate">
                            {`${window.location.origin}/t/${companyId}`}
                        </code>
                        <a
                            href={`/t/${companyId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium text-[#00a884] hover:bg-[#00a884]/10"
                        >
                            <ExternalLink size={16} />
                            Abrir
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
}
