/**
 * Ferramentas (Tools) do tenant: listar, criar, editar, excluir e testar retorno.
 */
import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Plus, Wrench, Trash2, Pencil, Play, X } from 'lucide-react';
import { getAdminHeaders } from '../admin/AdminKeyPage';

const API_BASE = import.meta.env.VITE_CHAT_API_URL || `http://localhost:${import.meta.env.VITE_API_PORT || '3001'}`;
const BASE = '/empresas';

type ToolExecution = { type: 'builtin'; key: string } | { type: 'http'; url: string; method: 'GET' | 'POST' };

type ToolConfig = {
    id: string;
    name: string;
    description: string;
    parameters: { type: 'object'; properties?: Record<string, unknown>; required?: string[] };
    execution: ToolExecution;
};

const BUILTIN_IDS = ['consultar_cliente', 'consultar_titulos', 'consultar_pedidos', 'consultar_estoque'];

/** Só as 4 tools do sistema são read-only; ferramentas criadas pelo usuário (outro id) podem ser editadas. */
function isBuiltin(tool: ToolConfig): boolean {
    return BUILTIN_IDS.includes(tool.id);
}

export default function TenantToolsPage() {
    const { id: companyId } = useParams<{ id: string }>();
    const [tools, setTools] = useState<ToolConfig[]>([]);
    const [config, setConfig] = useState<{ branding?: { companyName?: string } } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [modalOpen, setModalOpen] = useState<'add' | 'edit' | null>(null);
    const [testTool, setTestTool] = useState<ToolConfig | null>(null);
    const [testArgs, setTestArgs] = useState<Record<string, string>>({});
    const [testOutput, setTestOutput] = useState<string | null>(null);
    const [testError, setTestError] = useState(false);
    const [testLoading, setTestLoading] = useState(false);
    const [editingTool, setEditingTool] = useState<ToolConfig | null>(null);
    const [form, setForm] = useState({
        id: '',
        name: '',
        description: '',
        parametersJson: '{"type":"object","properties":{},"required":[]}',
        executionType: 'builtin' as 'builtin' | 'http',
        executionKey: 'consultar_estoque',
        executionUrl: '',
        executionMethod: 'GET' as 'GET' | 'POST',
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!companyId) return;
        Promise.all([
            axios.get<{ tools: ToolConfig[] }>(`${API_BASE}/api/admin/tenants/${encodeURIComponent(companyId)}/tools`, { headers: getAdminHeaders() }),
            axios.get(`${API_BASE}/api/admin/tenants/${encodeURIComponent(companyId)}`, { headers: getAdminHeaders() }),
        ])
            .then(([toolsRes, configRes]) => {
                setTools(toolsRes.data?.tools ?? []);
                setConfig(configRes.data ?? null);
            })
            .catch((err) => setError(err?.response?.data?.error || 'Erro ao carregar ferramentas.'))
            .finally(() => setLoading(false));
    }, [companyId]);

    const openAdd = () => {
        setEditingTool(null);
        setForm({
            id: '',
            name: '',
            description: '',
            parametersJson: '{"type":"object","properties":{},"required":[]}',
            executionType: 'builtin',
            executionKey: 'consultar_estoque',
            executionUrl: '',
            executionMethod: 'GET',
        });
        setModalOpen('add');
    };

    const openEdit = (tool: ToolConfig) => {
        if (isBuiltin(tool)) return;
        setEditingTool(tool);
        setForm({
            id: tool.id,
            name: tool.name,
            description: tool.description,
            parametersJson: JSON.stringify(tool.parameters, null, 2),
            executionType: tool.execution.type,
            executionKey: tool.execution.type === 'builtin' ? tool.execution.key : 'consultar_estoque',
            executionUrl: tool.execution.type === 'http' ? tool.execution.url : '',
            executionMethod: tool.execution.type === 'http' ? tool.execution.method : 'GET',
        });
        setModalOpen('edit');
    };

    const buildToolPayload = () => ({
        id: form.id.trim() || form.name.trim(),
        name: (form.name.trim() || form.id.trim()) as string,
        description: form.description.trim(),
        parameters: (() => {
            try {
                return JSON.parse(form.parametersJson);
            } catch {
                return { type: 'object', properties: {}, required: [] };
            }
        })(),
        execution:
            form.executionType === 'builtin'
                ? { type: 'builtin' as const, key: form.executionKey }
                : { type: 'http' as const, url: form.executionUrl.trim(), method: form.executionMethod },
    });

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!companyId) return;
        const payload = buildToolPayload();
        if (!payload.id || !payload.name) return;
        setSaving(true);
        setError(null);
        try {
            await axios.post(
                `${API_BASE}/api/admin/tenants/${encodeURIComponent(companyId)}/tools`,
                { tool: payload },
                { headers: getAdminHeaders() }
            );
            const res = await axios.get<{ tools: ToolConfig[] }>(`${API_BASE}/api/admin/tenants/${encodeURIComponent(companyId)}/tools`, { headers: getAdminHeaders() });
            setTools(res.data?.tools ?? []);
            setModalOpen(null);
        } catch (err: any) {
            setError(err?.response?.data?.error || 'Erro ao criar ferramenta.');
        } finally {
            setSaving(false);
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!companyId || !editingTool) return;
        const payload = buildToolPayload();
        setSaving(true);
        setError(null);
        try {
            await axios.patch(
                `${API_BASE}/api/admin/tenants/${encodeURIComponent(companyId)}/tools/${encodeURIComponent(editingTool.id)}`,
                payload,
                { headers: getAdminHeaders() }
            );
            const res = await axios.get<{ tools: ToolConfig[] }>(`${API_BASE}/api/admin/tenants/${encodeURIComponent(companyId)}/tools`, { headers: getAdminHeaders() });
            setTools(res.data?.tools ?? []);
            setModalOpen(null);
        } catch (err: any) {
            setError(err?.response?.data?.error || 'Erro ao atualizar ferramenta.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (tool: ToolConfig) => {
        if (isBuiltin(tool) || !companyId) return;
        if (!confirm(`Remover a ferramenta "${tool.name}"?`)) return;
        setError(null);
        try {
            await axios.delete(
                `${API_BASE}/api/admin/tenants/${encodeURIComponent(companyId)}/tools/${encodeURIComponent(tool.id)}`,
                { headers: getAdminHeaders() }
            );
            setTools((prev) => prev.filter((t) => t.id !== tool.id));
        } catch (err: any) {
            setError(err?.response?.data?.error || 'Erro ao remover ferramenta.');
        }
    };

    const openTest = (tool: ToolConfig) => {
        setTestTool(tool);
        const props = tool.parameters?.properties as Record<string, { description?: string }> | undefined;
        const initial: Record<string, string> = {};
        if (props) for (const k of Object.keys(props)) initial[k] = '';
        setTestArgs(initial);
        setTestOutput(null);
        setTestError(false);
    };

    const runTest = async () => {
        if (!companyId || !testTool) return;
        setTestLoading(true);
        setTestOutput(null);
        setTestError(false);
        try {
            const res = await axios.post<{ output?: string; error?: string }>(
                `${API_BASE}/api/admin/tenants/${encodeURIComponent(companyId)}/tools/${encodeURIComponent(testTool.id)}/test`,
                { args: testArgs },
                { headers: getAdminHeaders() }
            );
            const message = res.data?.error ?? res.data?.output ?? '';
            const isError = Boolean(res.data?.error) || (typeof message === 'string' && message.toLowerCase().startsWith('erro'));
            setTestOutput(message);
            setTestError(isError);
        } catch (err: any) {
            setTestOutput(err?.response?.data?.error ?? err?.message ?? 'Erro ao executar.');
            setTestError(true);
        } finally {
            setTestLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="py-8">
                <p className="text-[#54656f] dark:text-[#aebac1]">Carregando ferramentas…</p>
            </div>
        );
    }

    const companyName = config?.branding?.companyName || companyId;
    const labelCls = 'block text-sm font-medium text-[#111b21] dark:text-[#e9edef] mb-1';
    const inputCls = 'w-full px-3 py-2 rounded-md border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#2a3942] text-[#111b21] dark:text-[#e9edef]';

    return (
        <div>
            <div className="flex items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-4">
                    <Link to={`${BASE}/${companyId}`} className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 text-[#54656f] dark:text-[#aebac1]">
                        <ArrowLeft size={20} />
                    </Link>
                    <div>
                        <h1 className="text-xl font-semibold text-[#111b21] dark:text-[#e9edef]">Ferramentas (Tools)</h1>
                        <p className="text-sm text-[#54656f] dark:text-[#aebac1]">{companyName}</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={openAdd}
                    className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-[#00a884] text-white hover:bg-[#00a884]/90"
                >
                    <Plus size={18} />
                    Nova ferramenta
                </button>
            </div>

            {error && <p className="mb-4 text-sm text-red-500" role="alert">{error}</p>}

            <div className="space-y-3">
                {tools.map((tool) => (
                    <div
                        key={tool.id}
                        className="flex items-center justify-between gap-4 p-4 rounded-xl border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#202c33]"
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[#00a884]/10 dark:bg-[#00a884]/20 flex items-center justify-center">
                                <Wrench size={20} className="text-[#00a884]" />
                            </div>
                            <div className="min-w-0">
                                <p className="font-medium text-[#111b21] dark:text-[#e9edef] truncate">
                                    {tool.name}
                                    {isBuiltin(tool) && <span className="ml-2 text-xs text-[#54656f] dark:text-[#8696a0]">(built-in)</span>}
                                </p>
                                <p className="text-sm text-[#54656f] dark:text-[#8696a0] truncate">{tool.description || tool.id}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                                type="button"
                                onClick={() => openTest(tool)}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm bg-[#0d9488]/10 text-[#0d9488] hover:bg-[#0d9488]/20 border border-[#0d9488]/30"
                            >
                                <Play size={14} />
                                Testar
                            </button>
                            {!isBuiltin(tool) && (
                                <>
                                    <button type="button" onClick={() => openEdit(tool)} className="p-1.5 rounded text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5">
                                        <Pencil size={16} />
                                    </button>
                                    <button type="button" onClick={() => handleDelete(tool)} className="p-1.5 rounded text-red-500 hover:bg-red-500/10">
                                        <Trash2 size={16} />
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {tools.length === 0 && <p className="text-[#54656f] dark:text-[#aebac1] text-sm mt-4">Nenhuma ferramenta. Use "Nova ferramenta" para criar ou as built-ins já estão disponíveis ao vincular ao agente.</p>}

            {/* Modal Add/Edit */}
            {(modalOpen === 'add' || modalOpen === 'edit') && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setModalOpen(null)}>
                    <div className="bg-white dark:bg-[#202c33] rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b border-[#e9edef] dark:border-[#2a3942]">
                            <h2 className="font-semibold text-[#111b21] dark:text-[#e9edef]">{modalOpen === 'add' ? 'Nova ferramenta' : 'Editar ferramenta'}</h2>
                            <button type="button" onClick={() => setModalOpen(null)} className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={modalOpen === 'add' ? handleCreate : handleUpdate} className="p-4 space-y-4">
                            <div>
                                <label className={labelCls}>ID (único, ex: minha_busca)</label>
                                <input
                                    type="text"
                                    value={form.id}
                                    onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
                                    className={inputCls}
                                    placeholder="minha_busca"
                                    readOnly={!!editingTool}
                                />
                            </div>
                            <div>
                                <label className={labelCls}>Nome (para o LLM)</label>
                                <input
                                    type="text"
                                    value={form.name}
                                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                    className={inputCls}
                                    placeholder="consultar_produtos"
                                />
                            </div>
                            <div>
                                <label className={labelCls}>Descrição</label>
                                <textarea
                                    value={form.description}
                                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                                    className={inputCls}
                                    rows={2}
                                    placeholder="Instrução para quando usar esta ferramenta"
                                />
                            </div>
                            <div>
                                <label className={labelCls}>Parâmetros (JSON Schema)</label>
                                <textarea
                                    value={form.parametersJson}
                                    onChange={(e) => setForm((f) => ({ ...f, parametersJson: e.target.value }))}
                                    className={inputCls + ' font-mono text-sm'}
                                    rows={6}
                                />
                            </div>
                            <div>
                                <label className={labelCls}>Execução</label>
                                <select
                                    value={form.executionType}
                                    onChange={(e) => setForm((f) => ({ ...f, executionType: e.target.value as 'builtin' | 'http' }))}
                                    className={inputCls}
                                >
                                    <option value="builtin">Built-in (código)</option>
                                    <option value="http">HTTP (URL)</option>
                                </select>
                                {form.executionType === 'builtin' && (
                                    <select
                                        value={form.executionKey}
                                        onChange={(e) => setForm((f) => ({ ...f, executionKey: e.target.value }))}
                                        className={inputCls + ' mt-2'}
                                    >
                                        {BUILTIN_IDS.map((k) => (
                                            <option key={k} value={k}>{k}</option>
                                        ))}
                                    </select>
                                )}
                                {form.executionType === 'http' && (
                                    <div className="mt-2 space-y-2">
                                        <input
                                            type="url"
                                            value={form.executionUrl}
                                            onChange={(e) => setForm((f) => ({ ...f, executionUrl: e.target.value }))}
                                            className={inputCls}
                                            placeholder="https://api.exemplo.com/estoque"
                                        />
                                        <select
                                            value={form.executionMethod}
                                            onChange={(e) => setForm((f) => ({ ...f, executionMethod: e.target.value as 'GET' | 'POST' }))}
                                            className={inputCls}
                                        >
                                            <option value="GET">GET</option>
                                            <option value="POST">POST</option>
                                        </select>
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button type="submit" disabled={saving} className="px-4 py-2 rounded-md bg-[#00a884] text-white hover:bg-[#00a884]/90 disabled:opacity-60">
                                    {saving ? 'Salvando…' : 'Salvar'}
                                </button>
                                <button type="button" onClick={() => setModalOpen(null)} className="px-4 py-2 rounded-md border border-[#e9edef] dark:border-[#2a3942] text-[#111b21] dark:text-[#e9edef]">
                                    Cancelar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Test */}
            {testTool && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setTestTool(null)}>
                    <div className="bg-white dark:bg-[#202c33] rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b border-[#e9edef] dark:border-[#2a3942]">
                            <h2 className="font-semibold text-[#111b21] dark:text-[#e9edef]">Testar: {testTool.name}</h2>
                            <button type="button" onClick={() => setTestTool(null)} className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-4 space-y-4">
                            {Object.keys(testArgs).length > 0 && (
                                <div className="space-y-2">
                                    <label className={labelCls}>Parâmetros</label>
                                    {Object.keys(testArgs).map((key) => (
                                        <div key={key}>
                                            <label className="text-xs text-[#54656f] dark:text-[#8696a0]">{key}</label>
                                            <input
                                                type="text"
                                                value={testArgs[key]}
                                                onChange={(e) => setTestArgs((a) => ({ ...a, [key]: e.target.value }))}
                                                className={inputCls}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                            <button type="button" onClick={runTest} disabled={testLoading} className="px-4 py-2 rounded-md bg-[#0d9488] text-white hover:bg-[#0d9488]/90 disabled:opacity-60">
                                {testLoading ? 'Executando…' : 'Executar'}
                            </button>
                            {testOutput !== null && (
                                <div>
                                    <label className={labelCls}>
                                        Retorno {testError ? '(erro)' : '(sucesso)'}
                                    </label>
                                    <pre
                                        className={
                                            (testError
                                                ? 'border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-900/20 text-red-800 dark:text-red-200'
                                                : 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/20 text-[#111b21] dark:text-[#e9edef]') +
                                            ' w-full px-3 py-2 rounded-md border text-sm whitespace-pre-wrap max-h-60 overflow-y-auto'
                                        }
                                    >
                                        {testOutput}
                                    </pre>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
