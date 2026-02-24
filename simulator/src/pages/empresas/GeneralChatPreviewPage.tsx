/**
 * Preview geral do chat: escolhe o fluxo (agente inicial) e conversa.
 * Rota: /empresas/:companyId/preview
 * O handoff entre agentes segue a config (ex.: Atendente → Vendedor).
 */
import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { useTenant } from '../../context/TenantContext';
import { getAdminHeaders, ADMIN_KEY_STORAGE } from '../admin/AdminKeyPage';
import ChatPage from '../ChatPage';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_CHAT_API_URL || `http://localhost:${import.meta.env.VITE_API_PORT || '3001'}`;
const BASE = '/empresas';

type AssistantOption = { id: string; name: string };
type TenantConfig = {
    branding?: { companyName?: string };
    assistants?: AssistantOption[];
};

export default function GeneralChatPreviewPage() {
    const { companyId } = useParams<{ companyId: string }>();
    const navigate = useNavigate();
    const { setTenantId } = useTenant();
    const [config, setConfig] = useState<TenantConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedAgentId, setSelectedAgentId] = useState<string>('');

    useEffect(() => {
        const tid = (companyId ?? '').trim();
        if (!tid || tid === 'new') {
            navigate(BASE, { replace: true });
            return;
        }
        setTenantId(tid);
        setError(null);
        axios
            .get<TenantConfig>(`${API_BASE}/api/admin/tenants/${encodeURIComponent(tid)}`, { headers: getAdminHeaders() })
            .then((res) => {
                const c = res?.data;
                if (c && typeof c === 'object') {
                    setConfig(c as TenantConfig);
                    const list = Array.isArray(c.assistants) ? c.assistants.filter((a) => a?.id?.trim() && a?.name?.trim()) : [];
                    if (list.length > 0)
                        setSelectedAgentId((prev) => (prev && list.some((a) => a.id === prev)) ? prev : list[0].id);
                } else setError('Resposta inválida do servidor.');
            })
            .catch((err) => {
                if (err?.response?.status === 401) {
                    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
                    navigate(BASE, { replace: true });
                    return;
                }
                setError(err?.response?.status === 404 ? 'Empresa não encontrada.' : (err?.response?.data?.error || 'Erro ao carregar.'));
            })
            .finally(() => setLoading(false));
    }, [companyId, setTenantId, navigate]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh] text-[#54656f] dark:text-[#aebac1]">
                Carregando preview…
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

    const assistants = (config.assistants || []).filter((a) => a?.id?.trim() && a?.name?.trim());
    const companyName = config.branding?.companyName || companyId;

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="flex flex-wrap items-center gap-3 mb-4 shrink-0">
                <Link
                    to={`${BASE}/${encodeURIComponent(companyId!)}`}
                    className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 text-[#54656f] dark:text-[#aebac1]"
                >
                    <ArrowLeft size={20} />
                </Link>
                <div className="flex items-center gap-2">
                    <MessageCircle size={22} className="text-[#00a884]" />
                    <h1 className="text-lg font-semibold text-[#111b21] dark:text-[#e9edef]">Chat preview geral</h1>
                </div>
                <span className="text-sm text-[#54656f] dark:text-[#aebac1]">— {companyName}</span>
                {assistants.length > 0 && (
                    <label className="flex items-center gap-2 ml-auto">
                        <span className="text-sm text-[#54656f] dark:text-[#aebac1]">Fluxo / Agente inicial:</span>
                        <select
                            value={selectedAgentId}
                            onChange={(e) => setSelectedAgentId(e.target.value)}
                            className="rounded-lg border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#2a3942] text-[#111b21] dark:text-[#e9edef] px-3 py-2 text-sm focus:ring-2 focus:ring-[#00a884]/50 focus:border-[#00a884] outline-none"
                        >
                            {assistants.map((a) => (
                                <option key={a.id} value={a.id}>
                                    {a.name || a.id}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
            </div>
            <div className="flex-1 min-h-0 rounded-xl border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#202c33] overflow-hidden shadow-sm">
                {assistants.length === 0 ? (
                    <div className="flex items-center justify-center h-64 text-[#54656f] dark:text-[#aebac1]">
                        Nenhum agente configurado. Crie um agente na empresa para usar o preview.
                    </div>
                ) : (
                    <ChatPage assistantId={selectedAgentId} showConversationList />
                )}
            </div>
        </div>
    );
}
