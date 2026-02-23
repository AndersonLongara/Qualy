/**
 * Criar novo agente dentro da empresa.
 * Passo 1: seleção de template; Passo 2: formulário pré-preenchido.
 */
import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Save, Loader2, Sparkles, ChevronLeft } from 'lucide-react';
import { getAdminHeaders, ADMIN_KEY_STORAGE } from '../admin/AdminKeyPage';
import DataIntegrationSection, {
    defaultIntegrationValue,
    integrationValueToApi,
    type IntegrationValue,
} from '../../components/DataIntegrationSection';

const API_BASE = import.meta.env.VITE_CHAT_API_URL || `http://localhost:${import.meta.env.VITE_API_PORT || '3001'}`;

type AssistantConfig = {
    id: string;
    name: string;
    systemPromptPath?: string | null;
    systemPrompt?: string | null;
    model?: string | null;
    temperature?: number | null;
    api?: Record<string, unknown> | null;
    features?: Record<string, unknown> | null;
};

type TenantConfig = {
    branding: Record<string, unknown>;
    api: Record<string, unknown>;
    prompt: Record<string, unknown>;
    features: Record<string, unknown>;
    assistants?: AssistantConfig[];
};

type AgentTemplate = {
    id: string;
    label: string;
    description: string;
    icon: string;
    category: string;
    defaultName: string;
    defaultPrompt: string;
    defaultFeatures: { orderFlowEnabled: boolean; financialEnabled: boolean };
    defaultTemperature: number;
    suggestedId: string;
};

const CATEGORY_COLORS: Record<string, string> = {
    atendimento: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-700',
    vendas: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-700',
    financeiro: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-200 dark:border-yellow-700',
    suporte: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-700',
    personalizado: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-600',
};

const BASE = '/empresas';

export default function NewAgentPage() {
    const { companyId } = useParams<{ companyId: string }>();
    const navigate = useNavigate();
    const [step, setStep] = useState<'template' | 'form'>('template');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [config, setConfig] = useState<TenantConfig | null>(null);
    const [templates, setTemplates] = useState<AgentTemplate[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null);
    const [form, setForm] = useState({
        id: '',
        name: '',
        systemPrompt: '',
        model: '',
        temperature: 0.3 as number,
    });
    const [integration, setIntegration] = useState<IntegrationValue>(defaultIntegrationValue());
    const [generatingPrompt, setGeneratingPrompt] = useState(false);

    useEffect(() => {
        if (!companyId || companyId === 'new') {
            navigate(BASE, { replace: true });
            return;
        }
        Promise.all([
            axios.get<TenantConfig>(`${API_BASE}/api/admin/tenants/${encodeURIComponent(companyId)}`, { headers: getAdminHeaders() }),
            axios.get<{ templates: AgentTemplate[] }>(`${API_BASE}/api/admin/agent-templates`, { headers: getAdminHeaders() }),
        ])
            .then(([tenantRes, templatesRes]) => {
                setConfig(tenantRes?.data || null);
                setTemplates(templatesRes?.data?.templates || []);
            })
            .catch((err) => {
                if (err?.response?.status === 401) {
                    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
                    navigate(BASE, { replace: true });
                    return;
                }
                setError(err?.response?.data?.error || 'Erro ao carregar dados.');
            })
            .finally(() => setLoading(false));
    }, [companyId, navigate]);

    const handleSelectTemplate = (template: AgentTemplate) => {
        setSelectedTemplate(template);
        // pré-preenche o formulário com valores do template
        setForm({
            id: template.suggestedId,
            name: template.defaultName,
            systemPrompt: template.defaultPrompt,
            model: '',
            temperature: template.defaultTemperature,
        });
        // pré-define as features de integração baseado no template
        if (template.defaultFeatures.orderFlowEnabled || template.defaultFeatures.financialEnabled) {
            setIntegration((prev) => ({
                ...prev,
                orderFlowEnabled: template.defaultFeatures.orderFlowEnabled,
                financialEnabled: template.defaultFeatures.financialEnabled,
            }));
        }
        setStep('form');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!companyId || !config) return;
        const agentId = form.id.trim();
        const name = form.name.trim();
        if (!agentId || !name) {
            setError('Preencha ID e Nome do agente.');
            return;
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(agentId) || agentId.length > 64) {
            setError('ID do agente: apenas letras, números, hífen e underscore (máx. 64).');
            return;
        }
        const assistants = Array.isArray(config.assistants) ? [...config.assistants] : [];
        if (assistants.some((a) => a.id === agentId)) {
            setError('Já existe um agente com este ID.');
            return;
        }

        const { api: agentApi, features: agentFeatures } = integrationValueToApi(integration);

        setError(null);
        setSaving(true);
        const newAssistant: AssistantConfig = {
            id: agentId,
            name,
            systemPrompt: form.systemPrompt.trim() || null,
            model: form.model.trim() || null,
            temperature: form.temperature,
            api: agentApi as AssistantConfig['api'],
            features: agentFeatures,
        };
        try {
            await axios.post(
                `${API_BASE}/api/admin/tenants/${encodeURIComponent(companyId)}/assistants`,
                { assistant: newAssistant },
                { headers: getAdminHeaders() }
            );
            navigate(`${BASE}/agentes/${encodeURIComponent(companyId)}/${encodeURIComponent(agentId)}`, { replace: true });
        } catch (err: any) {
            setError(err?.response?.data?.error || err?.message || 'Erro ao criar agente.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="py-8">
                <p className="text-[#54656f] dark:text-[#aebac1]">Carregando…</p>
            </div>
        );
    }

    if (error && !config) {
        return (
            <div className="py-8">
                <p className="text-red-500">{error}</p>
                <Link to={BASE} className="mt-2 inline-block text-sm text-[#00a884] hover:underline">Voltar às empresas</Link>
            </div>
        );
    }

    const labelCls = 'block text-sm font-medium text-[#111b21] dark:text-[#e9edef] mb-1';
    const inputCls = 'w-full px-3 py-2 rounded-md border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#2a3942] text-[#111b21] dark:text-[#e9edef]';

    // ── Passo 1: Seleção de template ──
    if (step === 'template') {
        return (
            <div>
                <div className="flex items-center gap-4 mb-6">
                    <Link
                        to={`${BASE}/${encodeURIComponent(companyId!)}`}
                        className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 text-[#54656f] dark:text-[#aebac1]"
                    >
                        <ArrowLeft size={20} />
                    </Link>
                    <div>
                        <h1 className="text-xl font-semibold text-[#111b21] dark:text-[#e9edef]">Novo agente</h1>
                        <p className="text-sm text-[#54656f] dark:text-[#aebac1]">Escolha um perfil ou comece do zero</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">
                    {templates.map((template) => {
                        const colorCls = CATEGORY_COLORS[template.category] || CATEGORY_COLORS.personalizado;
                        return (
                            <button
                                key={template.id}
                                onClick={() => handleSelectTemplate(template)}
                                className={`text-left p-5 rounded-xl border-2 transition-all hover:shadow-md hover:-translate-y-0.5 ${colorCls}`}
                            >
                                <div className="text-3xl mb-3">{template.icon}</div>
                                <div className="font-semibold text-base mb-1">{template.label}</div>
                                <div className="text-sm opacity-80 leading-snug">{template.description}</div>
                                {(template.defaultFeatures.orderFlowEnabled || template.defaultFeatures.financialEnabled) && (
                                    <div className="flex gap-1 mt-3 flex-wrap">
                                        {template.defaultFeatures.orderFlowEnabled && (
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-black/10 dark:bg-white/10 font-medium">Pedidos</span>
                                        )}
                                        {template.defaultFeatures.financialEnabled && (
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-black/10 dark:bg-white/10 font-medium">Financeiro</span>
                                        )}
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    }

    // ── Passo 2: Formulário ──
    return (
        <div>
            <div className="flex items-center gap-4 mb-6">
                <button
                    onClick={() => setStep('template')}
                    className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 text-[#54656f] dark:text-[#aebac1]"
                    title="Voltar para seleção de template"
                >
                    <ChevronLeft size={20} />
                </button>
                <div>
                    <h1 className="text-xl font-semibold text-[#111b21] dark:text-[#e9edef]">
                        {selectedTemplate && selectedTemplate.id !== 'personalizado'
                            ? `${selectedTemplate.icon} ${selectedTemplate.label}`
                            : 'Novo agente'}
                    </h1>
                    {selectedTemplate && (
                        <p className="text-sm text-[#54656f] dark:text-[#aebac1]">{selectedTemplate.description}</p>
                    )}
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
                {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
                <div>
                    <label className={labelCls}>ID do agente *</label>
                    <input
                        type="text"
                        value={form.id}
                        onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
                        className={inputCls}
                        placeholder="ex: vendas, suporte"
                    />
                    <p className="text-xs text-[#54656f] dark:text-[#aebac1] mt-1">Letras, números, hífen e underscore. Máx. 64 caracteres.</p>
                </div>
                <div>
                    <label className={labelCls}>Nome *</label>
                    <input
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        className={inputCls}
                        placeholder="ex: Agente de Vendas"
                    />
                </div>
                <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                        <label className={labelCls}>Prompt do sistema (opcional)</label>
                        <button
                            type="button"
                            onClick={async () => {
                                setGeneratingPrompt(true);
                                setError(null);
                                try {
                                    const companyName = (config?.branding?.companyName as string) ?? '';
                                    const res = await axios.post<{ systemPrompt: string }>(
                                        `${API_BASE}/api/admin/generate-system-prompt`,
                                        {
                                            currentPrompt: form.systemPrompt || undefined,
                                            agentName: form.name || undefined,
                                            companyName: companyName || undefined,
                                        },
                                        { headers: getAdminHeaders() }
                                    );
                                    if (res.data?.systemPrompt) {
                                        setForm((f) => ({ ...f, systemPrompt: res.data.systemPrompt }));
                                    }
                                } catch (e: any) {
                                    setError(e?.response?.data?.error ?? 'Erro ao gerar prompt com IA.');
                                } finally {
                                    setGeneratingPrompt(false);
                                }
                            }}
                            disabled={generatingPrompt}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium bg-[#00a884]/10 text-[#00a884] hover:bg-[#00a884]/20 disabled:opacity-60 disabled:cursor-not-allowed border border-[#00a884]/30 dark:border-[#00a884]/40"
                            title="Refinar texto: deixar mais profissional em Markdown (sem acrescentar funções)"
                        >
                            {generatingPrompt ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                            {generatingPrompt ? 'Refinando…' : 'Refinar com IA'}
                        </button>
                    </div>
                    <textarea
                        value={form.systemPrompt}
                        onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
                        className={inputCls}
                        rows={8}
                        placeholder="Instruções que o modelo deve seguir..."
                    />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={labelCls}>Modelo (opcional)</label>
                        <input
                            type="text"
                            value={form.model}
                            onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                            className={inputCls}
                            placeholder="ex: openai/gpt-4o"
                        />
                    </div>
                    <div>
                        <label className={labelCls}>Temperatura (0–2)</label>
                        <input
                            type="number"
                            min={0}
                            max={2}
                            step={0.1}
                            value={form.temperature}
                            onChange={(e) => setForm((f) => ({ ...f, temperature: parseFloat(e.target.value) || 0.3 }))}
                            className={inputCls}
                        />
                    </div>
                </div>

                {/* ── Integração de dados ── */}
                <hr className="border-[#e9edef] dark:border-[#2a3942]" />
                <DataIntegrationSection
                    value={integration}
                    onChange={setIntegration}
                    disabled={saving}
                />

                <div className="flex gap-2 pt-2">
                    <button
                        type="submit"
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 rounded-md bg-[#00a884] hover:bg-[#008f72] text-white font-medium disabled:opacity-70"
                    >
                        {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                        {saving ? 'Criando…' : 'Criar agente'}
                    </button>
                    <Link
                        to={`${BASE}/${encodeURIComponent(companyId!)}`}
                        className="px-4 py-2 rounded-md border border-[#e9edef] dark:border-[#2a3942] text-[#111b21] dark:text-[#e9edef] hover:bg-black/5 dark:hover:bg-white/5"
                    >
                        Cancelar
                    </Link>
                </div>
            </form>
        </div>
    );
}
