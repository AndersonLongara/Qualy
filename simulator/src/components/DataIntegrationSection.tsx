/**
 * Seção de "Integração de dados" para formulários de agente.
 * Toggle Desativada / Produção / Mock, com campos específicos por modo.
 */
import { useState } from 'react';
import axios from 'axios';
import { Loader2, Sparkles, ChevronDown, ChevronRight, Database, Wifi, WifiOff } from 'lucide-react';
import { getAdminHeaders } from '../pages/admin/AdminKeyPage';

const API_BASE = import.meta.env.VITE_CHAT_API_URL || `http://localhost:${import.meta.env.VITE_API_PORT || '3001'}`;

export type IntegrationMode = 'disabled' | 'production' | 'mock';

export type MockSection = 'clientes' | 'titulos' | 'pedidos' | 'estoque';

export type IntegrationValue = {
    mode: IntegrationMode;
    baseUrl: string;
    routes: {
        clientes: string;
        titulos: string;
        pedidos: string;
        estoque: string;
        pedido_post: string;
    };
    mockData: Record<MockSection, string>;
    features: {
        orderFlowEnabled: boolean;
        financialEnabled: boolean;
    };
};

export function defaultIntegrationValue(): IntegrationValue {
    return {
        mode: 'disabled',
        baseUrl: '',
        routes: { clientes: '', titulos: '', pedidos: '', estoque: '', pedido_post: '' },
        mockData: { clientes: '', titulos: '', pedidos: '', estoque: '' },
        features: { orderFlowEnabled: true, financialEnabled: true },
    };
}

/** Converte o valor do componente para o formato AssistantConfig.api + features */
export function integrationValueToApi(v: IntegrationValue): {
    api: null | { mode: 'production' | 'mock'; baseUrl?: string | null; routes?: Record<string, string> | null; mockData?: Record<string, unknown> | null };
    features: null | { orderFlowEnabled: boolean; financialEnabled: boolean };
} {
    if (v.mode === 'disabled') return { api: null, features: null };

    if (v.mode === 'production') {
        const routes: Record<string, string> = {};
        if (v.routes.clientes.trim()) routes.clientes = v.routes.clientes.trim();
        if (v.routes.titulos.trim()) routes.titulos = v.routes.titulos.trim();
        if (v.routes.pedidos.trim()) routes.pedidos = v.routes.pedidos.trim();
        if (v.routes.estoque.trim()) routes.estoque = v.routes.estoque.trim();
        if (v.routes.pedido_post.trim()) routes.pedido_post = v.routes.pedido_post.trim();
        return {
            api: {
                mode: 'production',
                baseUrl: v.baseUrl.trim() || null,
                routes: Object.keys(routes).length > 0 ? routes : null,
            },
            features: v.features,
        };
    }

    // mock
    const mockData: Record<string, unknown> = {};
    const safeParse = (s: string) => {
        try { return s.trim() ? JSON.parse(s) : null; } catch { return null; }
    };
    const c = safeParse(v.mockData.clientes);
    const t = safeParse(v.mockData.titulos);
    const p = safeParse(v.mockData.pedidos);
    const e = safeParse(v.mockData.estoque);
    if (c) mockData.clientes = c;
    if (t) mockData.titulos = t;
    if (p) mockData.pedidos = p;
    if (e) mockData.estoque = e;

    return {
        api: { mode: 'mock', mockData: Object.keys(mockData).length > 0 ? mockData : null },
        features: v.features,
    };
}

/** Converte AssistantConfig.api e features (vindo da API) de volta para IntegrationValue */
export function apiToIntegrationValue(
    api: null | undefined | Record<string, unknown>,
    features: null | undefined | Record<string, unknown>
): IntegrationValue {
    const base = defaultIntegrationValue();
    if (!api || typeof api !== 'object') return base;
    const mode = api.mode === 'production' || api.mode === 'mock' ? api.mode : null;
    if (!mode) return base;

    base.mode = mode;
    if (typeof api.baseUrl === 'string') base.baseUrl = api.baseUrl;

    if (api.routes && typeof api.routes === 'object') {
        const r = api.routes as Record<string, string>;
        base.routes.clientes = r.clientes ?? '';
        base.routes.titulos = r.titulos ?? '';
        base.routes.pedidos = r.pedidos ?? '';
        base.routes.estoque = r.estoque ?? '';
        base.routes.pedido_post = r.pedido_post ?? '';
    }

    if (api.mockData && typeof api.mockData === 'object') {
        const md = api.mockData as Record<string, unknown>;
        if (md.clientes) base.mockData.clientes = JSON.stringify(md.clientes, null, 2);
        if (md.titulos) base.mockData.titulos = JSON.stringify(md.titulos, null, 2);
        if (md.pedidos) base.mockData.pedidos = JSON.stringify(md.pedidos, null, 2);
        if (md.estoque) base.mockData.estoque = JSON.stringify(md.estoque, null, 2);
    }

    if (features && typeof features === 'object') {
        const f = features as Record<string, unknown>;
        base.features.orderFlowEnabled = f.orderFlowEnabled !== false;
        base.features.financialEnabled = f.financialEnabled !== false;
    }

    return base;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dados de exemplo (mock padrão da plataforma)
// ─────────────────────────────────────────────────────────────────────────────
const EXAMPLE_DATA: Record<MockSection, unknown> = {
    clientes: {
        '12345678000195': {
            razao_social: 'Construtora Exemplo Ltda',
            fantasia: 'Construtora Exemplo',
            status: 'ativo',
            filiais: [{ id: '001', nome: 'Matriz' }, { id: '002', nome: 'Filial Centro' }],
        },
        '98765432000188': {
            razao_social: 'Materiais Beta SA',
            fantasia: 'Beta Materiais',
            status: 'bloqueado',
            filiais: [],
        },
    },
    titulos: {
        '12345678000195': [
            {
                numero_nota: 'NF-0042',
                valor_atualizado: 1850.0,
                vencimento: '2025-03-15',
                status: 'a_vencer',
                pdf_url: 'https://exemplo.com/boleto1.pdf',
                linha_digitavel: '10499.12345 56789.012345 67890.123456 1 12340000185000',
            },
            {
                numero_nota: 'NF-0038',
                valor_atualizado: 430.5,
                vencimento: '2025-01-20',
                status: 'vencido',
            },
        ],
    },
    pedidos: {
        '12345678000195': [
            {
                id: 'PED-2024-001',
                data: '2025-02-10',
                valor_total: 3200.0,
                status: 'em_transito',
                nfe: { numero: 'NF-5678', danfe_url: 'https://exemplo.com/danfe.pdf' },
                rastreio: { transportadora: 'Correios', codigo: 'BR123456789', status: 'Em rota de entrega' },
            },
        ],
    },
    estoque: [
        { nome: 'Cimento CP-II 50kg', sku: 'CIM-001', estoque_disponivel: 500, preco_tabela: 42.0, preco_promocional: 38.0 },
        { nome: 'Areia Grossa Saca 30kg', sku: 'ARE-002', estoque_disponivel: 0, preco_tabela: 18.5, preco_promocional: null },
        { nome: 'Tijolo Cerâmico 6 furos (cx 50un)', sku: 'TIJ-003', estoque_disponivel: 120, preco_tabela: 85.0 },
    ],
};

const MOCK_SECTION_LABELS: Record<MockSection, string> = {
    clientes: 'Clientes',
    titulos: 'Títulos',
    pedidos: 'Pedidos',
    estoque: 'Estoque',
};

interface Props {
    value: IntegrationValue;
    onChange: (v: IntegrationValue) => void;
    disabled?: boolean;
}

const inputCls = 'w-full px-3 py-2 rounded-md border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#2a3942] text-[#111b21] dark:text-[#e9edef] text-sm';
const labelCls = 'block text-sm font-medium text-[#111b21] dark:text-[#e9edef] mb-1';

export default function DataIntegrationSection({ value, onChange, disabled }: Props) {
    const [customRoutesOpen, setCustomRoutesOpen] = useState(false);
    const [activeSection, setActiveSection] = useState<MockSection>('clientes');
    const [generatingSection, setGeneratingSection] = useState<MockSection | null>(null);
    const [generateDesc, setGenerateDesc] = useState('');
    const [generateModalOpen, setGenerateModalOpen] = useState(false);
    const [generateError, setGenerateError] = useState<string | null>(null);

    const setMode = (m: IntegrationMode) => onChange({ ...value, mode: m });
    const setRoute = (k: keyof IntegrationValue['routes'], v: string) =>
        onChange({ ...value, routes: { ...value.routes, [k]: v } });
    const setMockData = (section: MockSection, v: string) =>
        onChange({ ...value, mockData: { ...value.mockData, [section]: v } });
    const setFeature = (k: keyof IntegrationValue['features'], v: boolean) =>
        onChange({ ...value, features: { ...value.features, [k]: v } });

    const modeBtn = (m: IntegrationMode, label: string, icon: React.ReactNode) => (
        <button
            type="button"
            onClick={() => !disabled && setMode(m)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                value.mode === m
                    ? 'bg-[#00a884] text-white'
                    : 'bg-[#f0f2f5] dark:bg-[#2a3942] text-[#54656f] dark:text-[#aebac1] hover:bg-[#e9edef] dark:hover:bg-[#3b4a54]'
            }`}
        >
            {icon}
            {label}
        </button>
    );

    const handleGenerateAi = async () => {
        if (!generateDesc.trim()) return;
        setGeneratingSection(activeSection);
        setGenerateError(null);
        try {
            const res = await axios.post<{ data: unknown }>(
                `${API_BASE}/api/admin/generate-mock-data`,
                { description: generateDesc.trim(), section: activeSection },
                { headers: getAdminHeaders() }
            );
            setMockData(activeSection, JSON.stringify(res.data.data, null, 2));
            setGenerateModalOpen(false);
            setGenerateDesc('');
        } catch (e: any) {
            setGenerateError(e?.response?.data?.error ?? 'Erro ao gerar dados com IA.');
        } finally {
            setGeneratingSection(null);
        }
    };

    return (
        <div className="space-y-4">
            {/* Título da seção */}
            <div className="flex items-center gap-2">
                <Database size={18} className="text-[#00a884]" />
                <h4 className="font-medium text-[#111b21] dark:text-[#e9edef]">Integração de dados</h4>
            </div>

            {/* Toggle de modo */}
            <div className="flex items-center gap-2 flex-wrap">
                {modeBtn('disabled', 'Desativada', <WifiOff size={15} />)}
                {modeBtn('production', 'Produção', <Wifi size={15} />)}
                {modeBtn('mock', 'Mock', <Database size={15} />)}
            </div>

            {value.mode === 'disabled' && (
                <p className="text-sm text-[#54656f] dark:text-[#aebac1]">
                    Sem integração. O agente responde perguntas gerais e redireciona conforme o prompt.
                </p>
            )}

            {/* ── Modo Produção ── */}
            {value.mode === 'production' && (
                <div className="space-y-4 pl-1">
                    <div>
                        <label className={labelCls}>URL base da API *</label>
                        <input
                            type="url"
                            value={value.baseUrl}
                            onChange={(e) => onChange({ ...value, baseUrl: e.target.value })}
                            disabled={disabled}
                            placeholder="https://erp.suaempresa.com"
                            className={inputCls}
                        />
                        <p className="text-xs text-[#54656f] dark:text-[#aebac1] mt-1">
                            URL raiz do ERP/sistema do cliente. Sem barra no final.
                        </p>
                    </div>

                    {/* Rotas customizadas */}
                    <div>
                        <button
                            type="button"
                            onClick={() => setCustomRoutesOpen((o) => !o)}
                            className="flex items-center gap-1.5 text-sm text-[#00a884] hover:underline"
                        >
                            {customRoutesOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                            Rotas customizadas (opcional)
                        </button>
                        {customRoutesOpen && (
                            <div className="mt-3 space-y-3 pl-3 border-l-2 border-[#e9edef] dark:border-[#2a3942]">
                                {(
                                    [
                                        ['clientes', '/v1/clientes'],
                                        ['titulos', '/v1/financeiro/titulos'],
                                        ['pedidos', '/v1/faturamento/pedidos'],
                                        ['estoque', '/v1/vendas/estoque'],
                                        ['pedido_post', '/v1/vendas/pedido'],
                                    ] as [keyof IntegrationValue['routes'], string][]
                                ).map(([key, placeholder]) => (
                                    <div key={key}>
                                        <label className="block text-xs font-medium text-[#54656f] dark:text-[#aebac1] mb-1 capitalize">
                                            {key === 'pedido_post' ? 'Criar pedido (POST)' : key.charAt(0).toUpperCase() + key.slice(1)}
                                        </label>
                                        <input
                                            type="text"
                                            value={value.routes[key]}
                                            onChange={(e) => setRoute(key, e.target.value)}
                                            disabled={disabled}
                                            placeholder={`Padrão: ${placeholder}`}
                                            className={inputCls}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Features */}
                    <div className="space-y-2">
                        <label className={labelCls}>Funcionalidades habilitadas</label>
                        <label className="flex items-center gap-2 text-sm text-[#111b21] dark:text-[#e9edef] cursor-pointer">
                            <input
                                type="checkbox"
                                checked={value.features.financialEnabled}
                                onChange={(e) => setFeature('financialEnabled', e.target.checked)}
                                disabled={disabled}
                                className="rounded border-[#e9edef] dark:border-[#2a3942]"
                            />
                            Financeiro (consulta de clientes, títulos e pedidos)
                        </label>
                        <label className="flex items-center gap-2 text-sm text-[#111b21] dark:text-[#e9edef] cursor-pointer">
                            <input
                                type="checkbox"
                                checked={value.features.orderFlowEnabled}
                                onChange={(e) => setFeature('orderFlowEnabled', e.target.checked)}
                                disabled={disabled}
                                className="rounded border-[#e9edef] dark:border-[#2a3942]"
                            />
                            Order flow (consulta de estoque e criação de pedidos)
                        </label>
                    </div>
                </div>
            )}

            {/* ── Modo Mock ── */}
            {value.mode === 'mock' && (
                <div className="space-y-4 pl-1">
                    <p className="text-sm text-[#54656f] dark:text-[#aebac1]">
                        O agente retorna os dados abaixo sem chamar nenhuma API externa.
                    </p>

                    {/* Abas de seção */}
                    <div className="flex gap-1 border-b border-[#e9edef] dark:border-[#2a3942]">
                        {(Object.keys(MOCK_SECTION_LABELS) as MockSection[]).map((s) => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => setActiveSection(s)}
                                className={`px-3 py-1.5 text-sm font-medium rounded-t-md border border-b-0 transition-colors ${
                                    activeSection === s
                                        ? 'border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#202c33] text-[#00a884]'
                                        : 'border-transparent text-[#54656f] dark:text-[#aebac1] hover:text-[#111b21] dark:hover:text-[#e9edef]'
                                }`}
                            >
                                {MOCK_SECTION_LABELS[s]}
                            </button>
                        ))}
                    </div>

                    {/* Editor JSON */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <label className="text-xs text-[#54656f] dark:text-[#aebac1] font-mono">
                                JSON — {MOCK_SECTION_LABELS[activeSection]}
                            </label>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setMockData(activeSection, JSON.stringify(EXAMPLE_DATA[activeSection], null, 2))}
                                    disabled={disabled}
                                    className="px-2.5 py-1.5 text-xs rounded-md border border-[#e9edef] dark:border-[#2a3942] text-[#54656f] dark:text-[#aebac1] hover:bg-[#f0f2f5] dark:hover:bg-[#3b4a54]"
                                >
                                    Usar dados de exemplo
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setGenerateDesc(''); setGenerateError(null); setGenerateModalOpen(true); }}
                                    disabled={disabled || generatingSection !== null}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md bg-[#00a884]/10 text-[#00a884] hover:bg-[#00a884]/20 border border-[#00a884]/30 dark:border-[#00a884]/40 disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {generatingSection === activeSection ? (
                                        <Loader2 size={13} className="animate-spin" />
                                    ) : (
                                        <Sparkles size={13} />
                                    )}
                                    Gerar com IA
                                </button>
                            </div>
                        </div>
                        <textarea
                            value={value.mockData[activeSection]}
                            onChange={(e) => setMockData(activeSection, e.target.value)}
                            disabled={disabled}
                            rows={10}
                            spellCheck={false}
                            className="w-full px-3 py-2 rounded-md border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#2a3942] text-[#111b21] dark:text-[#e9edef] text-xs font-mono"
                            placeholder={`Cole o JSON para ${MOCK_SECTION_LABELS[activeSection]}…`}
                        />
                    </div>

                    {/* Features */}
                    <div className="space-y-2">
                        <label className={labelCls}>Funcionalidades habilitadas</label>
                        <label className="flex items-center gap-2 text-sm text-[#111b21] dark:text-[#e9edef] cursor-pointer">
                            <input
                                type="checkbox"
                                checked={value.features.financialEnabled}
                                onChange={(e) => setFeature('financialEnabled', e.target.checked)}
                                disabled={disabled}
                                className="rounded border-[#e9edef] dark:border-[#2a3942]"
                            />
                            Financeiro (clientes, títulos, pedidos)
                        </label>
                        <label className="flex items-center gap-2 text-sm text-[#111b21] dark:text-[#e9edef] cursor-pointer">
                            <input
                                type="checkbox"
                                checked={value.features.orderFlowEnabled}
                                onChange={(e) => setFeature('orderFlowEnabled', e.target.checked)}
                                disabled={disabled}
                                className="rounded border-[#e9edef] dark:border-[#2a3942]"
                            />
                            Order flow (estoque e criação de pedidos)
                        </label>
                    </div>
                </div>
            )}

            {/* Modal de geração IA */}
            {generateModalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
                    onClick={() => generatingSection === null && setGenerateModalOpen(false)}
                >
                    <div
                        className="rounded-xl border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#202c33] shadow-xl max-w-lg w-full p-6 space-y-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between">
                            <h4 className="font-medium text-[#111b21] dark:text-[#e9edef] flex items-center gap-2">
                                <Sparkles size={18} className="text-[#00a884]" />
                                Gerar {MOCK_SECTION_LABELS[activeSection]} com IA
                            </h4>
                        </div>
                        <p className="text-sm text-[#54656f] dark:text-[#aebac1]">
                            Descreva o contexto do cliente para gerar dados de teste realistas.
                        </p>
                        <div>
                            <label className={labelCls}>Descrição</label>
                            <textarea
                                value={generateDesc}
                                onChange={(e) => setGenerateDesc(e.target.value)}
                                rows={3}
                                placeholder={
                                    activeSection === 'clientes'
                                        ? 'Ex.: empresa de materiais de construção com 2 clientes, um ativo e um bloqueado'
                                        : activeSection === 'titulos'
                                        ? 'Ex.: cliente com 3 títulos, sendo 1 vencido e 2 a vencer'
                                        : activeSection === 'pedidos'
                                        ? 'Ex.: cliente com 2 pedidos recentes, um em trânsito e um faturado'
                                        : 'Ex.: loja de tintas com 5 produtos, alguns sem estoque'
                                }
                                className="w-full px-3 py-2 rounded-md border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#2a3942] text-[#111b21] dark:text-[#e9edef] text-sm min-h-[80px]"
                            />
                        </div>
                        {generateError && (
                            <p className="text-sm text-red-500">{generateError}</p>
                        )}
                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => generatingSection === null && setGenerateModalOpen(false)}
                                className="px-4 py-2 rounded-md border border-[#e9edef] dark:border-[#2a3942] text-[#111b21] dark:text-[#e9edef] hover:bg-black/5 dark:hover:bg-white/5 text-sm font-medium"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={!generateDesc.trim() || generatingSection !== null}
                                onClick={handleGenerateAi}
                                className="flex items-center gap-2 px-4 py-2 rounded-md bg-[#00a884] hover:bg-[#008f72] text-white text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {generatingSection !== null ? (
                                    <Loader2 size={16} className="animate-spin" />
                                ) : (
                                    <Sparkles size={16} />
                                )}
                                {generatingSection !== null ? 'Gerando…' : 'Gerar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
