/**
 * Detalhe do agente: Configurações, Chat (preview), Execuções e Consumo.
 */
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, MessageCircle, ListOrdered, BarChart3, Settings, Save, Loader2, Sparkles, Link2, Copy, Check, ExternalLink, PlusCircle, X, GitBranch, Trash2, Plus, Wrench, History } from 'lucide-react';
import { useTenant } from '../../context/TenantContext';
import ChatPage from '../ChatPage';
import ExecutionsPage from '../ExecutionsPage';
import ChatHistoryTab from './ChatHistoryTab';
import axios from 'axios';
import { getAdminHeaders } from '../admin/AdminKeyPage';
import DataIntegrationSection, {
    defaultIntegrationValue,
    integrationValueToApi,
    apiToIntegrationValue,
    type IntegrationValue,
} from '../../components/DataIntegrationSection';

const API_BASE = import.meta.env.VITE_CHAT_API_URL || `http://localhost:${import.meta.env.VITE_API_PORT || '3001'}`;

function cn(...classes: (string | undefined | false)[]) {
    return classes.filter(Boolean).join(' ');
}

type HandoffRoute = {
    agentId: string;
    label: string;
    description: string;
};

type HandoffRules = {
    enabled: boolean;
    routes: HandoffRoute[];
};

type AssistantConfig = {
    id: string;
    name: string;
    systemPromptPath?: string | null;
    systemPrompt?: string | null;
    model?: string | null;
    temperature?: number | null;
    api?: Record<string, unknown> | null;
    features?: Record<string, unknown> | null;
    handoffRules?: HandoffRules | null;
    toolIds?: string[] | null;
};

type ToolConfig = { id: string; name: string; description?: string };

type TenantConfig = {
    branding: Record<string, unknown>;
    api: Record<string, unknown>;
    prompt: Record<string, unknown>;
    features: Record<string, unknown>;
    assistants?: AssistantConfig[];
};

function AgentConfiguracoes({ companyId, agentId }: { companyId: string; agentId: string }) {
    const [config, setConfig] = useState<TenantConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [form, setForm] = useState({ name: '', systemPrompt: '', model: '', temperature: 0.3 as number });
    const [integration, setIntegration] = useState<IntegrationValue>(defaultIntegrationValue());
    const [generatingPrompt, setGeneratingPrompt] = useState(false);
    const [incrementModalOpen, setIncrementModalOpen] = useState(false);
    const [incrementInstruction, setIncrementInstruction] = useState('');
    const [incrementing, setIncrementing] = useState(false);
    const [tools, setTools] = useState<ToolConfig[]>([]);
    const [selectedToolIds, setSelectedToolIds] = useState<string[]>([]);

    useEffect(() => {
        Promise.all([
            axios.get<TenantConfig>(`${API_BASE}/api/admin/tenants/${encodeURIComponent(companyId)}`, { headers: getAdminHeaders() }),
            axios.get<{ tools: ToolConfig[] }>(`${API_BASE}/api/admin/tenants/${encodeURIComponent(companyId)}/tools`, { headers: getAdminHeaders() }),
        ])
            .then(([configRes, toolsRes]) => {
                const c = configRes?.data;
                const toolsList = toolsRes?.data?.tools ?? [];
                setTools(toolsList);
                if (c?.assistants) {
                    const a = c.assistants.find((x) => x.id === agentId);
                    if (a) {
                        setForm({
                            name: a.name || '',
                            systemPrompt: a.systemPrompt ?? '',
                            model: a.model ?? '',
                            temperature: typeof a.temperature === 'number' ? a.temperature : 0.3,
                        });
                        setIntegration(apiToIntegrationValue(a.api ?? null, a.features ?? null));
                        setSelectedToolIds(Array.isArray(a.toolIds) ? a.toolIds : []);
                    }
                }
                setConfig(c || null);
            })
            .catch(() => setError('Erro ao carregar configuração.'))
            .finally(() => setLoading(false));
    }, [companyId, agentId]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!config) return;
        const { api: agentApi, features: agentFeatures } = integrationValueToApi(integration);
        const assistants = (config.assistants || []).map((a) =>
            a.id === agentId
                ? {
                    ...a,
                    name: form.name.trim(),
                    systemPrompt: form.systemPrompt.trim() || null,
                    model: form.model.trim() || null,
                    temperature: form.temperature,
                    api: agentApi,
                    features: agentFeatures,
                    toolIds: selectedToolIds.length > 0 ? selectedToolIds : undefined,
                  }
                : a
        );
        setSaving(true);
        setError(null);
        try {
            await axios.patch(
                `${API_BASE}/api/admin/tenants/${encodeURIComponent(companyId)}`,
                { ...config, assistants },
                { headers: getAdminHeaders() }
            );
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        } catch {
            setError('Erro ao salvar.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <p className="text-[#54656f] dark:text-[#aebac1]">Carregando configuração…</p>;
    if (error && !config) return <p className="text-red-500">{error}</p>;

    const labelCls = 'block text-sm font-medium text-[#111b21] dark:text-[#e9edef] mb-1';
    const inputCls = 'w-full px-3 py-2 rounded-md border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#2a3942] text-[#111b21] dark:text-[#e9edef]';

    return (
        <div className="space-y-4">
            <h3 className="font-medium text-[#111b21] dark:text-[#e9edef] flex items-center gap-2">
                <Settings size={20} />
                Configurações do agente
            </h3>
            <form onSubmit={handleSave} className="space-y-4 max-w-2xl">
                {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
                {success && <p className="text-sm text-green-600 dark:text-green-400">Salvo com sucesso.</p>}
                <div>
                    <label className={labelCls}>ID do agente</label>
                    <input type="text" value={agentId} readOnly className={inputCls + ' opacity-70'} />
                </div>
                <div>
                    <label className={labelCls}>Nome</label>
                    <input
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        className={inputCls}
                        placeholder="ex: Agente de Vendas"
                    />
                </div>
                <div>
                    <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                        <label className={labelCls}>Prompt do sistema</label>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setIncrementModalOpen(true)}
                                disabled={!form.systemPrompt.trim()}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium bg-[#0d9488]/10 text-[#0d9488] hover:bg-[#0d9488]/20 disabled:opacity-60 disabled:cursor-not-allowed border border-[#0d9488]/30 dark:border-[#0d9488]/40"
                                title="Adicionar uma nova regra/instrução ao prompt sem perder o que já tem"
                            >
                                <PlusCircle size={16} />
                                Incrementar com IA
                            </button>
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
                    </div>
                    <textarea
                        value={form.systemPrompt}
                        onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
                        className={inputCls}
                        rows={6}
                        placeholder="Instruções que o modelo deve seguir..."
                    />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={labelCls}>Modelo</label>
                        <input
                            type="text"
                            value={form.model}
                            onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                            className={inputCls}
                            placeholder="ex: openai/gpt-4o"
                        />
                    </div>
                    <div>
                        <label className={labelCls}>Temperadora (0–2)</label>
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

                {/* ── Ferramentas (tools) vinculadas ao agente ── */}
                <hr className="border-[#e9edef] dark:border-[#2a3942]" />
                <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                        <label className={labelCls}>Ferramentas</label>
                        <Link
                            to={`/empresas/${encodeURIComponent(companyId)}/tools`}
                            className="flex items-center gap-1.5 text-sm text-[#00a884] hover:underline"
                        >
                            <Wrench size={16} />
                            Gerenciar ferramentas
                        </Link>
                    </div>
                    <p className="text-xs text-[#54656f] dark:text-[#8696a0] mb-2">
                        Selecione as ferramentas que este agente pode usar. Se nenhuma for selecionada, o sistema usa o comportamento padrão (por recursos).
                    </p>
                    <div className="flex flex-wrap gap-3">
                        {tools.map((t) => (
                            <label key={t.id} className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={selectedToolIds.includes(t.id)}
                                    onChange={(e) => {
                                        if (e.target.checked) setSelectedToolIds((prev) => [...prev, t.id]);
                                        else setSelectedToolIds((prev) => prev.filter((id) => id !== t.id));
                                    }}
                                    className="rounded border-[#e9edef] dark:border-[#2a3942] text-[#00a884] focus:ring-[#00a884]"
                                />
                                <span className="text-sm text-[#111b21] dark:text-[#e9edef]">{t.name}</span>
                            </label>
                        ))}
                    </div>
                    {tools.length === 0 && (
                        <p className="text-sm text-[#54656f] dark:text-[#8696a0]">
                            Nenhuma ferramenta cadastrada.{' '}
                            <Link to={`/empresas/${encodeURIComponent(companyId)}/tools`} className="text-[#00a884] hover:underline">
                                Criar ferramentas no painel
                            </Link>
                        </p>
                    )}
                </div>

                <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 rounded-md bg-[#00a884] hover:bg-[#008f72] text-white font-medium disabled:opacity-70"
                >
                    {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    {saving ? 'Salvando…' : 'Salvar'}
                </button>
            </form>

            {incrementModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !incrementing && setIncrementModalOpen(false)}>
                    <div
                        className="rounded-xl border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#202c33] shadow-xl max-w-lg w-full p-6 space-y-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between">
                            <h4 className="font-medium text-[#111b21] dark:text-[#e9edef] flex items-center gap-2">
                                <PlusCircle size={20} />
                                Incrementar prompt com IA
                            </h4>
                            <button
                                type="button"
                                onClick={() => !incrementing && setIncrementModalOpen(false)}
                                className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-[#54656f] dark:text-[#aebac1]"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <p className="text-sm text-[#54656f] dark:text-[#aebac1]">
                            Descreva o que deseja <strong>adicionar</strong> ao prompt. A IA vai integrar essa instrução de forma profissional, <strong>sem remover</strong> nada do que já está escrito.
                        </p>
                        <div>
                            <label className="block text-sm font-medium text-[#111b21] dark:text-[#e9edef] mb-1">Instrução a incrementar</label>
                            <textarea
                                value={incrementInstruction}
                                onChange={(e) => setIncrementInstruction(e.target.value)}
                                placeholder="Ex.: Tentar identificar a intenção do que o usuário quer e enviar para o setor correspondente; essa é a única função do agente."
                                className="w-full px-3 py-2 rounded-md border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#2a3942] text-[#111b21] dark:text-[#e9edef] text-sm min-h-[100px]"
                                rows={4}
                            />
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => !incrementing && setIncrementModalOpen(false)}
                                className="px-4 py-2 rounded-md border border-[#e9edef] dark:border-[#2a3942] text-[#111b21] dark:text-[#e9edef] hover:bg-black/5 dark:hover:bg-white/5 text-sm font-medium"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={incrementing || !incrementInstruction.trim()}
                                onClick={async () => {
                                    if (!incrementInstruction.trim() || !form.systemPrompt.trim()) return;
                                    setIncrementing(true);
                                    setError(null);
                                    try {
                                        const companyName = (config?.branding?.companyName as string) ?? '';
                                        const res = await axios.post<{ systemPrompt: string }>(
                                            `${API_BASE}/api/admin/increment-prompt`,
                                            {
                                                currentPrompt: form.systemPrompt,
                                                instruction: incrementInstruction.trim(),
                                                agentName: form.name || undefined,
                                                companyName: companyName || undefined,
                                            },
                                            { headers: getAdminHeaders() }
                                        );
                                        if (res.data?.systemPrompt) {
                                            setForm((f) => ({ ...f, systemPrompt: res.data.systemPrompt }));
                                            setIncrementInstruction('');
                                            setIncrementModalOpen(false);
                                        }
                                    } catch (e: any) {
                                        setError(e?.response?.data?.error ?? 'Erro ao incrementar prompt com IA.');
                                    } finally {
                                        setIncrementing(false);
                                    }
                                }}
                                className="flex items-center gap-2 px-4 py-2 rounded-md bg-[#0d9488] hover:bg-[#0f766e] text-white text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {incrementing ? <Loader2 size={18} className="animate-spin" /> : <PlusCircle size={18} />}
                                {incrementing ? 'Incrementando…' : 'Incrementar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const PAGE_SIZE = 10;

type UsageRecord = {
    timestamp: string;
    model?: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimated_cost_usd: number;
};

function AgentConsumo({ companyId, agentId }: { companyId: string; agentId?: string }) {
    const [usage, setUsage] = useState<{ prompt_tokens: number; completion_tokens: number; total_tokens: number; estimated_cost_usd: number } | null>(null);
    const [records, setRecords] = useState<UsageRecord[]>([]);
    const [recordsTotal, setRecordsTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(true);
    const [from, setFrom] = useState(() => {
        const d = new Date();
        d.setDate(1);
        return d.toISOString().slice(0, 10);
    });
    const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

    const fetchUsage = () => {
        setLoading(true);
        const fromIso = from ? `${from}T00:00:00.000Z` : undefined;
        const toIso = to ? `${to}T23:59:59.999Z` : undefined;
        const params = new URLSearchParams();
        params.set('tenantId', companyId);
        if (fromIso) params.set('from', fromIso);
        if (toIso) params.set('to', toIso);
        if (agentId) params.set('assistantId', agentId);

        const headers = getAdminHeaders();
        Promise.all([
            axios.get(`${API_BASE}/api/usage?${params}`, { headers }).then((res) => res.data),
            axios.get(`${API_BASE}/api/usage/records?${params}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`, { headers: { ...headers, 'X-Tenant-Id': companyId } }).then((res) => res.data),
        ])
            .then(([totals, recordsResult]) => {
                setUsage({
                    prompt_tokens: totals.prompt_tokens ?? 0,
                    completion_tokens: totals.completion_tokens ?? 0,
                    total_tokens: totals.total_tokens ?? 0,
                    estimated_cost_usd: totals.estimated_cost_usd ?? 0,
                });
                setRecords(recordsResult.items ?? []);
                setRecordsTotal(recordsResult.total ?? 0);
            })
            .catch(() => {
                setUsage(null);
                setRecords([]);
                setRecordsTotal(0);
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchUsage();
    }, [companyId, agentId]);

    useEffect(() => {
        if (page === 0) return;
        const fromIso = from ? `${from}T00:00:00.000Z` : undefined;
        const toIso = to ? `${to}T23:59:59.999Z` : undefined;
        const params = new URLSearchParams();
        params.set('tenantId', companyId);
        if (fromIso) params.set('from', fromIso);
        if (toIso) params.set('to', toIso);
        if (agentId) params.set('assistantId', agentId);
        params.set('limit', String(PAGE_SIZE));
        params.set('offset', String(page * PAGE_SIZE));
        axios
            .get(`${API_BASE}/api/usage/records?${params}`, { headers: { ...getAdminHeaders(), 'X-Tenant-Id': companyId } })
            .then((res) => {
                setRecords(res.data.items ?? []);
                setRecordsTotal(res.data.total ?? 0);
            })
            .catch(() => {});
    }, [page, companyId, agentId, from, to]);

    const totalPages = Math.max(1, Math.ceil(recordsTotal / PAGE_SIZE));
    const formatDate = (iso: string) => {
        try {
            return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
        } catch {
            return iso;
        }
    };

    return (
        <div className="space-y-4">
            <h3 className="font-medium text-[#111b21] dark:text-[#e9edef] flex items-center gap-2">
                <BarChart3 size={20} />
                Consumo {agentId ? `(agente ${agentId})` : '(empresa)'}
            </h3>
            <p className="text-sm text-[#54656f] dark:text-[#aebac1]">
                Uso de tokens e custo estimado (USD) no período. Abaixo, detalhamento por uso (máx. {PAGE_SIZE} por página).
            </p>
            <div className="flex flex-wrap items-end gap-2 mb-4">
                <div>
                    <label className="block text-xs text-[#54656f] dark:text-[#8696a0] mb-1">De</label>
                    <input
                        type="date"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                        className="rounded border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#2a3942] px-3 py-2 text-sm text-[#111b21] dark:text-[#e9edef]"
                    />
                </div>
                <div>
                    <label className="block text-xs text-[#54656f] dark:text-[#8696a0] mb-1">Até</label>
                    <input
                        type="date"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                        className="rounded border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#2a3942] px-3 py-2 text-sm text-[#111b21] dark:text-[#e9edef]"
                    />
                </div>
                <button
                    type="button"
                    onClick={() => { setPage(0); fetchUsage(); }}
                    disabled={loading}
                    className="rounded-lg bg-[#00a884] text-white px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
                >
                    {loading ? 'Carregando…' : 'Atualizar'}
                </button>
            </div>
            {loading && !usage ? (
                <p className="text-[#54656f] dark:text-[#aebac1]">Carregando…</p>
            ) : usage ? (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#202c33]">
                        <div>
                            <span className="text-xs text-[#54656f] dark:text-[#8696a0]">Tokens entrada</span>
                            <p className="text-lg font-medium text-[#111b21] dark:text-[#e9edef]">{usage.prompt_tokens.toLocaleString('pt-BR')}</p>
                        </div>
                        <div>
                            <span className="text-xs text-[#54656f] dark:text-[#8696a0]">Tokens saída</span>
                            <p className="text-lg font-medium text-[#111b21] dark:text-[#e9edef]">{usage.completion_tokens.toLocaleString('pt-BR')}</p>
                        </div>
                        <div>
                            <span className="text-xs text-[#54656f] dark:text-[#8696a0]">Total tokens</span>
                            <p className="text-lg font-medium text-[#111b21] dark:text-[#e9edef]">{usage.total_tokens.toLocaleString('pt-BR')}</p>
                        </div>
                        <div>
                            <span className="text-xs text-[#54656f] dark:text-[#8696a0]">Custo est. (USD)</span>
                            <p className="text-lg font-medium text-[#111b21] dark:text-[#e9edef]">${usage.estimated_cost_usd.toFixed(4)}</p>
                        </div>
                    </div>

                    <div className="rounded-lg border border-[#e9edef] dark:border-[#2a3942] overflow-hidden bg-white dark:bg-[#202c33]">
                        <h4 className="text-sm font-medium text-[#54656f] dark:text-[#aebac1] px-4 py-2 border-b border-[#e9edef] dark:border-[#2a3942]">
                            Detalhamento por uso
                        </h4>
                        {records.length === 0 ? (
                            <p className="p-4 text-sm text-[#54656f] dark:text-[#aebac1]">Nenhum registro no período.</p>
                        ) : (
                            <>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-[#f0f2f5] dark:bg-[#111b21] text-[#54656f] dark:text-[#8696a0]">
                                            <tr>
                                                <th className="px-4 py-2 font-medium">Data/Hora</th>
                                                <th className="px-4 py-2 font-medium">Modelo</th>
                                                <th className="px-4 py-2 font-medium text-right">Entrada</th>
                                                <th className="px-4 py-2 font-medium text-right">Saída</th>
                                                <th className="px-4 py-2 font-medium text-right">Total</th>
                                                <th className="px-4 py-2 font-medium text-right">Custo (USD)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-[#111b21] dark:text-[#e9edef]">
                                            {records.map((r, i) => (
                                                <tr key={i} className="border-t border-[#e9edef] dark:border-[#2a3942] hover:bg-black/5 dark:hover:bg-white/5">
                                                    <td className="px-4 py-2 whitespace-nowrap">{formatDate(r.timestamp)}</td>
                                                    <td className="px-4 py-2 font-mono text-xs">{r.model ?? '—'}</td>
                                                    <td className="px-4 py-2 text-right">{r.prompt_tokens.toLocaleString('pt-BR')}</td>
                                                    <td className="px-4 py-2 text-right">{r.completion_tokens.toLocaleString('pt-BR')}</td>
                                                    <td className="px-4 py-2 text-right">{r.total_tokens.toLocaleString('pt-BR')}</td>
                                                    <td className="px-4 py-2 text-right">${r.estimated_cost_usd.toFixed(6)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {recordsTotal > PAGE_SIZE && (
                                    <div className="flex items-center justify-between px-4 py-2 border-t border-[#e9edef] dark:border-[#2a3942] text-sm text-[#54656f] dark:text-[#8696a0]">
                                        <span>
                                            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, recordsTotal)} de {recordsTotal}
                                        </span>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setPage((p) => Math.max(0, p - 1))}
                                                disabled={page === 0}
                                                className="px-3 py-1 rounded border border-[#e9edef] dark:border-[#2a3942] hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                Anterior
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                                                disabled={page >= totalPages - 1}
                                                className="px-3 py-1 rounded border border-[#e9edef] dark:border-[#2a3942] hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                Próxima
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </>
            ) : (
                <p className="text-[#54656f] dark:text-[#aebac1]">Nenhum uso no período.</p>
            )}
        </div>
    );
}

function AgentLinksTab({ companyId }: { companyId: string }) {
    const [copied, setCopied] = useState<'webhook' | 'chat' | null>(null);
    const webhookUrl = `${API_BASE}/webhook/messages/${encodeURIComponent(companyId)}`;
    const chatPreviewUrl = typeof window !== 'undefined' ? `${window.location.origin}/t/${encodeURIComponent(companyId)}` : '';

    const copy = (text: string, key: 'webhook' | 'chat') => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(key);
            setTimeout(() => setCopied(null), 2000);
        });
    };

    return (
        <div className="space-y-6 max-w-2xl">
            <h3 className="font-medium text-[#111b21] dark:text-[#e9edef] flex items-center gap-2">
                <Link2 size={20} />
                Links de acesso
            </h3>
            <p className="text-sm text-[#54656f] dark:text-[#aebac1]">
                Compartilhe o link do chat com o cliente para testes e aprovação. Use o webhook para integrar com WhatsApp ou outra API.
            </p>

            <div className="rounded-lg border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#202c33] p-4 space-y-4">
                <div>
                    <label className="block text-sm font-medium text-[#111b21] dark:text-[#e9edef] mb-1">Link do chat (preview)</label>
                    <p className="text-xs text-[#54656f] dark:text-[#8696a0] mb-2">
                        Para o cliente acessar, visualizar o chat e realizar testes e aprovação.
                    </p>
                    <div className="flex gap-2 flex-wrap items-center">
                        <input
                            type="text"
                            readOnly
                            value={chatPreviewUrl}
                            className="flex-1 min-w-0 px-3 py-2 rounded-md border border-[#e9edef] dark:border-[#2a3942] bg-[#f0f2f5] dark:bg-[#111b21] text-sm text-[#111b21] dark:text-[#e9edef] font-mono"
                        />
                        <button
                            type="button"
                            onClick={() => copy(chatPreviewUrl, 'chat')}
                            className="flex items-center gap-2 px-3 py-2 rounded-md border border-[#00a884]/40 bg-[#00a884]/10 text-[#00a884] hover:bg-[#00a884]/20 text-sm font-medium"
                        >
                            {copied === 'chat' ? <Check size={16} /> : <Copy size={16} />}
                            {copied === 'chat' ? 'Copiado' : 'Copiar'}
                        </button>
                        <a
                            href={chatPreviewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-2 rounded-md border border-[#e9edef] dark:border-[#2a3942] text-[#111b21] dark:text-[#e9edef] hover:bg-black/5 dark:hover:bg-white/5 text-sm font-medium"
                        >
                            <ExternalLink size={16} />
                            Abrir
                        </a>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-[#111b21] dark:text-[#e9edef] mb-1">Link do webhook</label>
                    <p className="text-xs text-[#54656f] dark:text-[#8696a0] mb-2">
                        URL para configurar na plataforma de mensageria (ex.: WhatsApp Business API). Requer POST com body: phone, message (ou text/content).
                    </p>
                    <div className="flex gap-2 flex-wrap items-center">
                        <input
                            type="text"
                            readOnly
                            value={webhookUrl}
                            className="flex-1 min-w-0 px-3 py-2 rounded-md border border-[#e9edef] dark:border-[#2a3942] bg-[#f0f2f5] dark:bg-[#111b21] text-sm text-[#111b21] dark:text-[#e9edef] font-mono"
                        />
                        <button
                            type="button"
                            onClick={() => copy(webhookUrl, 'webhook')}
                            className="flex items-center gap-2 px-3 py-2 rounded-md border border-[#00a884]/40 bg-[#00a884]/10 text-[#00a884] hover:bg-[#00a884]/20 text-sm font-medium"
                        >
                            {copied === 'webhook' ? <Check size={16} /> : <Copy size={16} />}
                            {copied === 'webhook' ? 'Copiado' : 'Copiar'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Roteamento: configuração da cadeia de agentes (handoff rules)
// ─────────────────────────────────────────────────────────────────────────────
function AgentRoteamento({ companyId, agentId }: { companyId: string; agentId: string }) {
    const [config, setConfig] = useState<TenantConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [enabled, setEnabled] = useState(false);
    const [routes, setRoutes] = useState<HandoffRoute[]>([]);
    const [newRoute, setNewRoute] = useState<HandoffRoute>({ agentId: '', label: '', description: '' });

    useEffect(() => {
        axios
            .get<TenantConfig>(`${API_BASE}/api/admin/tenants/${encodeURIComponent(companyId)}`, { headers: getAdminHeaders() })
            .then((res) => {
                const c = res?.data;
                setConfig(c || null);
                if (c?.assistants) {
                    const a = c.assistants.find((x) => x.id === agentId);
                    if (a?.handoffRules) {
                        setEnabled(a.handoffRules.enabled ?? false);
                        setRoutes(a.handoffRules.routes ?? []);
                    }
                }
            })
            .catch(() => setError('Erro ao carregar configuração.'))
            .finally(() => setLoading(false));
    }, [companyId, agentId]);

    const otherAgents = config?.assistants?.filter((a) => a.id !== agentId) ?? [];
    const addedAgentIds = new Set(routes.map((r) => r.agentId));
    const availableAgents = otherAgents.filter((a) => !addedAgentIds.has(a.id));

    const handleAddRoute = () => {
        if (!newRoute.agentId || !newRoute.label) return;
        setRoutes((prev) => [...prev, { ...newRoute }]);
        setNewRoute({ agentId: '', label: '', description: '' });
    };

    const handleRemoveRoute = (idx: number) => {
        setRoutes((prev) => prev.filter((_, i) => i !== idx));
    };

    const handleSave = async () => {
        if (!config) return;
        setSaving(true);
        setError(null);
        try {
            const freshRes = await axios.get<TenantConfig>(
                `${API_BASE}/api/admin/tenants/${encodeURIComponent(companyId)}`,
                { headers: getAdminHeaders() }
            );
            const freshConfig = freshRes.data || config;
            const assistants = (freshConfig.assistants || []).map((a) =>
                a.id === agentId
                    ? { ...a, handoffRules: { enabled, routes } }
                    : a
            );
            await axios.patch(
                `${API_BASE}/api/admin/tenants/${encodeURIComponent(companyId)}`,
                { ...freshConfig, assistants },
                { headers: getAdminHeaders() }
            );
            setConfig(freshConfig);
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        } catch {
            setError('Erro ao salvar roteamento.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <p className="text-[#54656f] dark:text-[#aebac1]">Carregando…</p>;

    const inputCls = 'px-3 py-2 rounded-md border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#2a3942] text-[#111b21] dark:text-[#e9edef] text-sm w-full';

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <GitBranch size={20} className="text-[#00a884]" />
                    <h3 className="font-medium text-[#111b21] dark:text-[#e9edef]">Cadeia de Agentes</h3>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                    <span className="text-sm text-[#54656f] dark:text-[#aebac1]">Ativar roteamento</span>
                    <div
                        onClick={() => setEnabled((v) => !v)}
                        className={cn(
                            'w-10 h-6 rounded-full transition-colors relative cursor-pointer',
                            enabled ? 'bg-[#00a884]' : 'bg-[#e9edef] dark:bg-[#2a3942]'
                        )}
                    >
                        <span className={cn(
                            'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform',
                            enabled ? 'translate-x-5' : 'translate-x-1'
                        )} />
                    </div>
                </label>
            </div>

            <div className={cn('rounded-lg border p-4 space-y-4 transition-opacity', enabled ? 'border-[#00a884]/30 bg-[#00a884]/5 dark:bg-[#00a884]/5' : 'border-[#e9edef] dark:border-[#2a3942] opacity-60 pointer-events-none')}>
                <p className="text-sm text-[#54656f] dark:text-[#aebac1]">
                    Quando ativo, este agente pode transferir o atendimento para outros agentes da empresa. Configure abaixo quais agentes estão disponíveis e quando transferir.
                </p>

                {/* Rotas cadastradas */}
                {routes.length > 0 && (
                    <div className="space-y-2">
                        <p className="text-xs font-semibold text-[#54656f] dark:text-[#aebac1] uppercase tracking-wide">Agentes disponíveis para transferência</p>
                        {routes.map((route, idx) => (
                            <div key={idx} className="flex items-start gap-2 p-3 rounded-lg border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#1a2530]">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs px-2 py-0.5 rounded bg-[#00a884]/10 text-[#00a884] font-mono">{route.agentId}</span>
                                        <span className="text-sm font-medium text-[#111b21] dark:text-[#e9edef]">{route.label}</span>
                                    </div>
                                    {route.description && (
                                        <p className="text-xs text-[#54656f] dark:text-[#aebac1] mt-0.5">{route.description}</p>
                                    )}
                                </div>
                                <button onClick={() => handleRemoveRoute(idx)} className="text-red-400 hover:text-red-600 p-1 rounded flex-shrink-0">
                                    <Trash2 size={15} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Adicionar nova rota */}
                {otherAgents.length === 0 ? (
                    <div className="pt-2 border-t border-[#e9edef] dark:border-[#2a3942]">
                        <p className="text-xs text-yellow-600 dark:text-yellow-400">Esta empresa ainda não tem outros agentes cadastrados.</p>
                    </div>
                ) : availableAgents.length === 0 ? (
                    <div className="pt-2 border-t border-[#e9edef] dark:border-[#2a3942]">
                        <p className="text-xs text-[#00a884]">Todos os agentes desta empresa já foram adicionados como destino.</p>
                    </div>
                ) : (
                    <div className="space-y-2 pt-2 border-t border-[#e9edef] dark:border-[#2a3942]">
                        <p className="text-xs font-semibold text-[#54656f] dark:text-[#aebac1] uppercase tracking-wide">Adicionar agente de destino</p>
                        <div className="flex gap-2 flex-wrap">
                            <select
                                value={newRoute.agentId}
                                onChange={(e) => {
                                    const selected = availableAgents.find((a) => a.id === e.target.value);
                                    setNewRoute((r) => ({
                                        ...r,
                                        agentId: e.target.value,
                                        label: selected?.name || r.label,
                                    }));
                                }}
                                className="flex-1 min-w-[140px] px-3 py-2 rounded-md border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#2a3942] text-[#111b21] dark:text-[#e9edef] text-sm"
                            >
                                <option value="">Selecionar agente…</option>
                                {availableAgents.map((a) => (
                                    <option key={a.id} value={a.id}>{a.name} ({a.id})</option>
                                ))}
                            </select>
                            <input
                                type="text"
                                value={newRoute.label}
                                onChange={(e) => setNewRoute((r) => ({ ...r, label: e.target.value }))}
                                placeholder="Rótulo (ex: Vendedor)"
                                className={cn(inputCls, 'flex-1 min-w-[120px]')}
                            />
                        </div>
                        <input
                            type="text"
                            value={newRoute.description}
                            onChange={(e) => setNewRoute((r) => ({ ...r, description: e.target.value }))}
                            placeholder="Quando transferir? (ex: quando o cliente quiser fazer um pedido)"
                            className={inputCls}
                        />
                        <button
                            onClick={handleAddRoute}
                            disabled={!newRoute.agentId || !newRoute.label}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-[#00a884]/10 text-[#00a884] hover:bg-[#00a884]/20 disabled:opacity-50 disabled:cursor-not-allowed border border-[#00a884]/30"
                        >
                            <Plus size={15} />
                            Adicionar
                        </button>
                    </div>
                )}
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}
            {success && <p className="text-sm text-green-600 dark:text-green-400">Roteamento salvo com sucesso.</p>}

            <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-md bg-[#00a884] hover:bg-[#008f72] text-white font-medium disabled:opacity-70 text-sm"
            >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? 'Salvando…' : 'Salvar roteamento'}
            </button>
        </div>
    );
}

export default function AgentDetailPage() {
    const { companyId, agentId } = useParams<{ companyId: string; agentId: string }>();
    const [searchParams] = useSearchParams();
    const { setTenantId } = useTenant();
    const [tab, setTab] = useState<'config' | 'chat' | 'historico' | 'executions' | 'webhook' | 'consumo' | 'links' | 'routing'>('config');
    const [chatKey, setChatKey] = useState(0);

    useEffect(() => {
        const t = searchParams.get('tab');
        if (t === 'chat') setTab('chat');
    }, [searchParams]);

    useEffect(() => {
        if (companyId) setTenantId(companyId);
        return () => { /* opcional: restaurar tenant anterior */ };
    }, [companyId, setTenantId]);

    if (!companyId || !agentId) {
        return (
            <div className="p-6">
                <p className="text-red-500">Parâmetros inválidos.</p>
                <Link to="/empresas" className="mt-2 inline-block text-sm text-[#00a884] hover:underline">Voltar às empresas</Link>
            </div>
        );
    }

    return (
        <div className="pb-2">
            <div className="flex items-center gap-3 mb-4">
                <Link
                    to={`/empresas/${encodeURIComponent(companyId)}`}
                    className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 text-[#54656f] dark:text-[#aebac1]"
                >
                    <ArrowLeft size={20} />
                </Link>
                <div>
                    <h1 className="text-lg font-semibold text-[#111b21] dark:text-[#e9edef]">
                        Agente: {agentId}
                    </h1>
                    <p className="text-xs text-[#54656f] dark:text-[#aebac1]">Empresa: {companyId}</p>
                </div>
            </div>

            <nav className="flex flex-wrap gap-1 border-b border-[#e9edef] dark:border-[#2a3942] mb-4">
                <button
                    type="button"
                    onClick={() => setTab('config')}
                    className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-t-md text-sm font-medium transition-colors',
                        tab === 'config' ? 'bg-[#00a884]/10 text-[#00a884]' : 'text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5'
                    )}
                >
                    <Settings size={18} />
                    Configurações
                </button>
                <button
                    type="button"
                    onClick={() => setTab('chat')}
                    className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-t-md text-sm font-medium transition-colors',
                        tab === 'chat' ? 'bg-[#00a884]/10 text-[#00a884]' : 'text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5'
                    )}
                >
                    <MessageCircle size={18} />
                    Chat (preview)
                </button>
                <button
                    type="button"
                    onClick={() => setTab('historico')}
                    className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-t-md text-sm font-medium transition-colors',
                        tab === 'historico' ? 'bg-[#00a884]/10 text-[#00a884]' : 'text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5'
                    )}
                >
                    <History size={18} />
                    Histórico
                </button>
                <button
                    type="button"
                    onClick={() => setTab('executions')}
                    className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-t-md text-sm font-medium transition-colors',
                        tab === 'executions' ? 'bg-[#00a884]/10 text-[#00a884]' : 'text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5'
                    )}
                >
                    <ListOrdered size={18} />
                    Execuções
                </button>
                <button
                    type="button"
                    onClick={() => setTab('webhook')}
                    className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-t-md text-sm font-medium transition-colors',
                        tab === 'webhook' ? 'bg-[#00a884]/10 text-[#00a884]' : 'text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5'
                    )}
                >
                    <Link2 size={18} />
                    Webhook
                </button>
                <button
                    type="button"
                    onClick={() => setTab('consumo')}
                    className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-t-md text-sm font-medium transition-colors',
                        tab === 'consumo' ? 'bg-[#00a884]/10 text-[#00a884]' : 'text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5'
                    )}
                >
                    <BarChart3 size={18} />
                    Consumo
                </button>
                <button
                    type="button"
                    onClick={() => setTab('links')}
                    className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-t-md text-sm font-medium transition-colors',
                        tab === 'links' ? 'bg-[#00a884]/10 text-[#00a884]' : 'text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5'
                    )}
                >
                    <Link2 size={18} />
                    Links
                </button>
                <button
                    type="button"
                    onClick={() => setTab('routing')}
                    className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-t-md text-sm font-medium transition-colors',
                        tab === 'routing' ? 'bg-[#00a884]/10 text-[#00a884]' : 'text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5'
                    )}
                >
                    <GitBranch size={18} />
                    Roteamento
                </button>
            </nav>

            {tab === 'config' && (
                <div className="rounded-xl border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#202c33] p-6">
                    <AgentConfiguracoes companyId={companyId} agentId={agentId} />
                </div>
            )}
            {tab === 'chat' && (
                <div className="w-full h-[calc(100vh-11rem)] min-h-[500px] rounded-xl border border-[#e9edef] dark:border-[#2a3942] overflow-hidden bg-white dark:bg-[#202c33] flex flex-col">
                    <ChatPage key={chatKey} assistantId={agentId} showConversationList />
                </div>
            )}
            {tab === 'historico' && (
                <ChatHistoryTab
                    companyId={companyId}
                    tenantId={companyId}
                    onNewConversation={() => {
                        const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
                        if (typeof localStorage !== 'undefined') localStorage.setItem('qualy_session_id', newId);
                        setChatKey((k) => k + 1);
                        setTab('chat');
                    }}
                />
            )}
            {tab === 'executions' && (
                <div className="rounded-xl border border-[#e9edef] dark:border-[#2a3942] overflow-hidden bg-white dark:bg-[#202c33]">
                    <ExecutionsPage />
                </div>
            )}
            {tab === 'webhook' && (
                <div className="rounded-xl border border-[#e9edef] dark:border-[#2a3942] overflow-hidden bg-white dark:bg-[#202c33]">
                    <ExecutionsPage source="webhook" title="Execuções de webhook" />
                </div>
            )}
            {tab === 'consumo' && (
                <div className="rounded-xl border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#202c33] p-6">
                    <AgentConsumo companyId={companyId} agentId={agentId} />
                </div>
            )}
            {tab === 'links' && (
                <div className="rounded-xl border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#202c33] p-6">
                    <AgentLinksTab companyId={companyId} />
                </div>
            )}
            {tab === 'routing' && (
                <div className="rounded-xl border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#202c33] p-6">
                    <AgentRoteamento companyId={companyId} agentId={agentId} />
                </div>
            )}
        </div>
    );
}
