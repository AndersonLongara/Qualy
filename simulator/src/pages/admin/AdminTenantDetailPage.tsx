import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { getAdminHeaders, ADMIN_KEY_STORAGE } from './AdminKeyPage';

const QUALY_API_PORT = import.meta.env.VITE_API_PORT || '3001';
const ADMIN_API_BASE = import.meta.env.VITE_CHAT_API_URL || `http://localhost:${QUALY_API_PORT}`;

const RESERVED_IDS = ['new', 'default', 'undefined', 'null', ''];
function isInvalidTenantId(id: string | undefined): boolean {
    const s = (id ?? '').trim().toLowerCase();
    return !s || RESERVED_IDS.includes(s) || !/^[a-zA-Z0-9_-]+$/.test(s) || s.length > 64;
}

type AssistantConfig = {
    id: string;
    name: string;
    systemPromptPath?: string | null;
    systemPrompt?: string | null;
    model?: string | null;
    temperature?: number | null;
};

type OrderFlowMessages = {
    askProduct?: string | null;
    askDocument?: string | null;
    askDocumentWithQuantity?: string | null;
    invalidDocument?: string | null;
    customerNotFound?: string | null;
    customerBlocked?: string | null;
    askQuantity?: string | null;
    onlyNUnitsAvailable?: string | null;
    confirmOrder?: string | null;
    orderSuccess?: string | null;
    orderErrorFallback?: string | null;
    orderCancelled?: string | null;
    confirmYesNo?: string | null;
};

type HumanEscalationConfig = {
    enabled: boolean;
    message?: string | null;
    webhookUrl?: string | null;
    method?: 'GET' | 'POST';
};

type ChatFlowConfig = {
    entryAgentId: string;
    humanEscalation?: HumanEscalationConfig | null;
};

type TenantConfig = {
    branding: { companyName: string; assistantName: string; productName?: string };
    api: { baseUrl: string };
    prompt: {
        systemPromptPath?: string | null;
        systemPrompt?: string | null;
        greeting?: string | null;
        humanAgentMessage?: string | null;
        temperature?: number | null;
        orderFlowMessages?: OrderFlowMessages | null;
    };
    features: { orderFlowEnabled: boolean; financialEnabled: boolean };
    assistants?: AssistantConfig[];
    chatFlow?: ChatFlowConfig | null;
};


type Props = { basePath?: string };

export default function AdminTenantDetailPage({ basePath = '/admin' }: Props) {
    const { id: idParam } = useParams<{ id: string }>();
    const location = useLocation();
    const id = idParam ?? '';
    const navigate = useNavigate();
    const isNew = id === 'new' || (location.pathname.endsWith('/new') && !id);
    const [config, setConfig] = useState<TenantConfig | null>(null);
    const [form, setForm] = useState({
        id: '',
        branding: { companyName: '', assistantName: '', productName: '' },
        api: { baseUrl: `http://localhost:${QUALY_API_PORT}` },
        prompt: {
            systemPromptPath: null as string | null,
            systemPrompt: null as string | null,
            greeting: null as string | null,
            humanAgentMessage: null as string | null,
            temperature: 0.3 as number | null,
            orderFlowMessages: null as OrderFlowMessages | null,
        },
        features: { orderFlowEnabled: true, financialEnabled: true },
        assistants: [] as AssistantConfig[],
        chatFlow: null as ChatFlowConfig | null,
    });
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isNew) {
            setForm((f) => ({
                ...f,
                id: '',
                branding: { companyName: '', assistantName: '', productName: '' },
                api: { baseUrl: `http://localhost:${QUALY_API_PORT}` },
                prompt: { systemPromptPath: null, systemPrompt: null, greeting: null, humanAgentMessage: null, temperature: 0.3, orderFlowMessages: null },
                features: { orderFlowEnabled: true, financialEnabled: true },
                assistants: [],
            }));
            setLoading(false);
            return;
        }
        if (isInvalidTenantId(id)) {
            const bad = (id ?? '').trim().toLowerCase();
            if (bad === 'undefined' || bad === 'null' || bad === '') {
                navigate(`${basePath}/new`, { replace: true });
                return;
            }
            setError('ID inválido ou reservado. Use apenas letras, números, hífen e underscore (ex: minha-empresa).');
            setLoading(false);
            return;
        }
        setError(null);
        axios
            .get<TenantConfig>(`${ADMIN_API_BASE}/api/admin/tenants/${encodeURIComponent(id)}`, { headers: getAdminHeaders() })
            .then((res) => {
                const c = res?.data;
                if (!c || typeof c !== 'object') {
                    setError('Resposta inválida do servidor.');
                    return;
                }
                const branding = c.branding && typeof c.branding === 'object' ? c.branding : { companyName: '', assistantName: '', productName: '' };
                const api = c.api && typeof c.api === 'object' ? c.api : { baseUrl: `http://localhost:${QUALY_API_PORT}` };
                const features = c.features && typeof c.features === 'object' ? c.features : { orderFlowEnabled: true, financialEnabled: true };
                const prompt = (c as any).prompt && typeof (c as any).prompt === 'object' ? (c as any).prompt : {};
                setConfig(c as TenantConfig);
                setForm({
                    id,
                    branding: { ...branding, companyName: branding.companyName ?? '', assistantName: branding.assistantName ?? '', productName: branding.productName ?? '' },
                    api: { baseUrl: api.baseUrl ?? `http://localhost:${QUALY_API_PORT}` },
                    prompt: {
                        systemPromptPath: prompt.systemPromptPath ?? null,
                        systemPrompt: prompt.systemPrompt ?? null,
                        greeting: prompt.greeting ?? null,
                        humanAgentMessage: prompt.humanAgentMessage ?? null,
                        temperature: typeof prompt.temperature === 'number' ? prompt.temperature : 0.3,
                        orderFlowMessages: prompt.orderFlowMessages && typeof prompt.orderFlowMessages === 'object' ? { ...prompt.orderFlowMessages } : null,
                    },
                    features: { ...features },
                    assistants: Array.isArray(c.assistants) ? c.assistants.map((a: any) => ({
                        ...a,
                        systemPromptPath: a.systemPromptPath ?? null,
                        systemPrompt: a.systemPrompt ?? null,
                        model: a.model ?? null,
                        temperature: a.temperature ?? null,
                    })) : [],
                    chatFlow: (c as any).chatFlow && typeof (c as any).chatFlow === 'object' ? {
                        entryAgentId: (c as any).chatFlow.entryAgentId ?? '',
                        humanEscalation: (c as any).chatFlow.humanEscalation ?? null,
                    } : null,
                });
            })
            .catch((err) => {
                if (err?.response?.status === 401) {
                    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
                    navigate(basePath, { replace: true });
                    return;
                }
                if (err?.response?.status === 404) {
                    setError('Empresa não encontrada. O ID pode estar errado ou a empresa ainda não foi criada. Use "Voltar" e crie uma nova empresa com um ID válido (ex: minha-empresa).');
                } else {
                    setError(err?.response?.data?.error || 'Erro ao carregar tenant.');
                }
            })
            .finally(() => setLoading(false));
    }, [id, isNew, navigate]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);
        setSaving(true);
        const payload = {
            branding: form.branding,
            api: form.api,
            prompt: form.prompt,
            features: form.features,
            assistants: form.assistants.filter((a) => a.id.trim() && a.name.trim()),
            chatFlow: form.chatFlow?.entryAgentId?.trim() ? form.chatFlow : null,
        };
        try {
            if (isNew) {
                const newId = form.id.trim();
                if (!newId) {
                    setError('Informe o ID da empresa (slug), por ex.: minha-empresa ou empresa_teste.');
                    setSaving(false);
                    return;
                }
                if (isInvalidTenantId(newId)) {
                    setError('ID inválido. Use apenas letras, números, hífen e underscore (máx. 64 caracteres). Não use: new, default, undefined.');
                    setSaving(false);
                    return;
                }
                await axios.post(`${ADMIN_API_BASE}/api/admin/tenants`, { ...payload, id: newId }, { headers: getAdminHeaders() });
                navigate(`/empresas/${encodeURIComponent(newId)}/agentes/new`, { replace: true });
            } else {
                await axios.patch(`${ADMIN_API_BASE}/api/admin/tenants/${encodeURIComponent(id)}`, payload, { headers: getAdminHeaders() });
                setConfig({ ...config!, ...payload });
                setSuccessMessage('Alterações salvas com sucesso.');
                setTimeout(() => setSuccessMessage(null), 4000);
            }
        } catch (err: any) {
            setError(err?.response?.data?.error || err?.message || 'Erro ao salvar.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="p-6">
                <p className="text-[#54656f] dark:text-[#aebac1]">Carregando…</p>
            </div>
        );
    }

    const inputCls = "w-full px-3 py-2 rounded-md border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#2a3942] text-[#111b21] dark:text-[#e9edef]";
    const labelCls = "block text-sm font-medium text-[#111b21] dark:text-[#e9edef] mb-1";

    const showInvalidOrNotFound = !isNew && (error && (id === 'undefined' || error.includes('não encontrada')));

    return (
        <div className="p-6 max-w-2xl">
            <div className="flex items-center gap-4 mb-6">
                <Link to={isNew ? basePath : `${basePath}/${encodeURIComponent(id)}`} className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 text-[#54656f] dark:text-[#aebac1]">
                    <ArrowLeft size={20} />
                </Link>
                <h1 className="text-xl font-semibold text-[#111b21] dark:text-[#e9edef]">
                    {isNew ? 'Nova empresa' : `Editar empresa: ${id}`}
                </h1>
            </div>
            {showInvalidOrNotFound && (
                <div className="mb-4 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <p className="text-sm text-amber-800 dark:text-amber-200">{error}</p>
                    <Link to={`${basePath}/new`} className="mt-2 inline-block text-sm font-medium text-[#00a884] hover:underline">
                        Criar nova empresa →
                    </Link>
                </div>
            )}
            <form onSubmit={handleSave} className="space-y-6">
                {successMessage && (
                    <p className="text-sm text-green-600 dark:text-green-400 font-medium" role="status">
                        {successMessage}
                    </p>
                )}
                {error && !showInvalidOrNotFound && <p className="text-sm text-red-500" role="alert">{error}</p>}
                {saving && (
                    <p className="text-sm text-[#54656f] dark:text-[#aebac1] flex items-center gap-2">
                        <Loader2 size={16} className="animate-spin" />
                        Salvando alterações…
                    </p>
                )}
                {isNew && (
                    <div>
                        <label className={labelCls}>ID da empresa (slug) <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            value={form.id}
                            onChange={(e) => setForm((f) => ({ ...f, id: e.target.value.replace(/\s/g, '') }))}
                            className={inputCls}
                            placeholder="ex: minha-empresa ou empresa_teste"
                            pattern="[a-zA-Z0-9_-]+"
                            title="Apenas letras, números, hífen e underscore"
                        />
                        <p className="text-xs text-[#54656f] dark:text-[#aebac1] mt-1">Obrigatório. Apenas letras, números, hífen e underscore (máx. 64 caracteres). Ex.: minha-empresa</p>
                    </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={labelCls}>Nome da empresa</label>
                        <input
                            type="text"
                            value={form.branding.companyName}
                            onChange={(e) => setForm((f) => ({ ...f, branding: { ...f.branding, companyName: e.target.value } }))}
                            className={inputCls}
                        />
                    </div>
                    <div>
                        <label className={labelCls}>Nome do assistente (padrão)</label>
                        <input
                            type="text"
                            value={form.branding.assistantName}
                            onChange={(e) => setForm((f) => ({ ...f, branding: { ...f.branding, assistantName: e.target.value } }))}
                            className={inputCls}
                        />
                    </div>
                </div>
                {!isNew && (
                    <div className="space-y-3 rounded-lg border border-[#e9edef] dark:border-[#2a3942] p-4">
                        <h3 className="text-sm font-semibold text-[#111b21] dark:text-[#e9edef]">Mensagens do fluxo de pedido (opcional)</h3>
                        <p className="text-xs text-[#54656f] dark:text-[#aebac1]">Personalize as mensagens exibidas durante o fluxo de pedido. Use {'{{productName}}'}, {'{{qty}}'}, {'{{total}}'}, {'{{customerName}}'}, {'{{available}}'}, {'{{pedido_id}}'}, {'{{mensagem}}'} nos textos onde aplicável. Deixe em branco para usar o padrão do sistema.</p>
                        {[
                            { key: 'askProduct' as const, label: 'Pedir produto (sem produto selecionado)' },
                            { key: 'askDocument' as const, label: 'Pedir CPF/CNPJ (pedido sem quantidade)' },
                            { key: 'askDocumentWithQuantity' as const, label: 'Pedir CPF/CNPJ (com quantidade)' },
                            { key: 'invalidDocument' as const, label: 'Documento inválido' },
                            { key: 'customerNotFound' as const, label: 'Cliente não encontrado' },
                            { key: 'customerBlocked' as const, label: 'Cliente bloqueado' },
                            { key: 'orderCancelled' as const, label: 'Pedido cancelado' },
                        ].map(({ key, label }) => (
                            <div key={key}>
                                <label className={labelCls}>{label}</label>
                                <input
                                    type="text"
                                    value={form.prompt.orderFlowMessages?.[key] ?? ''}
                                    onChange={(e) => setForm((f) => ({
                                        ...f,
                                        prompt: {
                                            ...f.prompt,
                                            orderFlowMessages: {
                                                ...(f.prompt.orderFlowMessages || {}),
                                                [key]: e.target.value.trim() || null,
                                            },
                                        },
                                    }))}
                                    className={inputCls}
                                    placeholder="(padrão do sistema)"
                                />
                            </div>
                        ))}
                    </div>
                )}

                {!isNew && (
                    <div className="space-y-3 rounded-lg border border-[#e9edef] dark:border-[#2a3942] p-4">
                        <h3 className="text-sm font-semibold text-[#111b21] dark:text-[#e9edef]">Fluxo do Chat</h3>
                        <p className="text-xs text-[#54656f] dark:text-[#aebac1]">
                            Define o agente inicial do chat e as regras de escalação para atendente humano. O link público <code className="bg-black/10 dark:bg-white/10 px-1 rounded">/t/{id}</code> usará essas configurações.
                        </p>

                        <div>
                            <label className={labelCls}>Agente de entrada (entryAgentId)</label>
                            {form.assistants.length > 0 ? (
                                <select
                                    value={form.chatFlow?.entryAgentId ?? ''}
                                    onChange={(e) => setForm((f) => ({
                                        ...f,
                                        chatFlow: { ...(f.chatFlow || { entryAgentId: '' }), entryAgentId: e.target.value },
                                    }))}
                                    className={inputCls}
                                >
                                    <option value="">— Nenhum (usa padrão) —</option>
                                    {form.assistants.filter((a) => a.id.trim()).map((a) => (
                                        <option key={a.id} value={a.id}>{a.name || a.id}</option>
                                    ))}
                                </select>
                            ) : (
                                <p className="text-xs text-[#54656f] dark:text-[#aebac1]">Nenhum agente cadastrado. Crie agentes primeiro.</p>
                            )}
                        </div>

                        <div className="space-y-2 pt-2 border-t border-[#e9edef] dark:border-[#2a3942]">
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={form.chatFlow?.humanEscalation?.enabled ?? false}
                                    onChange={(e) => setForm((f) => ({
                                        ...f,
                                        chatFlow: {
                                            ...(f.chatFlow || { entryAgentId: '' }),
                                            humanEscalation: {
                                                ...(f.chatFlow?.humanEscalation || { enabled: false }),
                                                enabled: e.target.checked,
                                            },
                                        },
                                    }))}
                                    className="accent-[#00a884]"
                                />
                                <span className="text-sm text-[#111b21] dark:text-[#e9edef]">Habilitar escalação para atendente humano</span>
                            </label>

                            {form.chatFlow?.humanEscalation?.enabled && (
                                <>
                                    <div>
                                        <label className={labelCls}>Mensagem ao cliente (escalação)</label>
                                        <input
                                            type="text"
                                            value={form.chatFlow?.humanEscalation?.message ?? ''}
                                            onChange={(e) => setForm((f) => ({
                                                ...f,
                                                chatFlow: {
                                                    ...(f.chatFlow || { entryAgentId: '' }),
                                                    humanEscalation: {
                                                        ...(f.chatFlow?.humanEscalation || { enabled: true }),
                                                        message: e.target.value || null,
                                                    },
                                                },
                                            }))}
                                            className={inputCls}
                                            placeholder="Vou transferir você para um de nossos atendentes..."
                                        />
                                    </div>
                                    <div>
                                        <label className={labelCls}>Webhook URL (opcional)</label>
                                        <input
                                            type="url"
                                            value={form.chatFlow?.humanEscalation?.webhookUrl ?? ''}
                                            onChange={(e) => setForm((f) => ({
                                                ...f,
                                                chatFlow: {
                                                    ...(f.chatFlow || { entryAgentId: '' }),
                                                    humanEscalation: {
                                                        ...(f.chatFlow?.humanEscalation || { enabled: true }),
                                                        webhookUrl: e.target.value || null,
                                                    },
                                                },
                                            }))}
                                            className={inputCls}
                                            placeholder="https://seu-crm.com/webhook/escalacao"
                                        />
                                        <p className="text-xs text-[#54656f] dark:text-[#aebac1] mt-1">Será chamado quando o cliente pedir atendente humano. Recebe: tenantId, phone, message, timestamp.</p>
                                    </div>
                                    <div>
                                        <label className={labelCls}>Método HTTP do webhook</label>
                                        <select
                                            value={form.chatFlow?.humanEscalation?.method ?? 'POST'}
                                            onChange={(e) => setForm((f) => ({
                                                ...f,
                                                chatFlow: {
                                                    ...(f.chatFlow || { entryAgentId: '' }),
                                                    humanEscalation: {
                                                        ...(f.chatFlow?.humanEscalation || { enabled: true }),
                                                        method: e.target.value as 'GET' | 'POST',
                                                    },
                                                },
                                            }))}
                                            className={inputCls}
                                        >
                                            <option value="POST">POST</option>
                                            <option value="GET">GET</option>
                                        </select>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}

                <div className="rounded-lg border border-[#00a884]/30 bg-[#00a884]/10 p-3">
                    <p className="text-sm text-[#111b21] dark:text-[#e9edef]">
                        {isNew
                            ? 'As configurações de prompt, temperatura e fluxo agora são feitas na criação do agente. Após salvar a empresa, você será direcionado para "Novo agente".'
                            : 'Prompt, temperatura, features e URL da API são configurados individualmente em cada agente da empresa.'}
                    </p>
                </div>

                <div className="flex gap-2">
                    <button
                        type="submit"
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 rounded-md bg-[#00a884] hover:bg-[#008f72] text-white font-medium disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                        {saving ? 'Salvando…' : 'Salvar'}
                    </button>
                    <Link to={isNew ? basePath : `${basePath}/${encodeURIComponent(id)}`} className="px-4 py-2 rounded-md border border-[#e9edef] dark:border-[#2a3942] text-[#111b21] dark:text-[#e9edef] hover:bg-black/5 dark:hover:bg-white/5">
                        Cancelar
                    </Link>
                </div>
            </form>
        </div>
    );
}
