import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Copy, Check, ExternalLink, BarChart3 } from 'lucide-react';
import { useTenant } from '../context/TenantContext';

const API_PORT = import.meta.env.VITE_API_PORT || '3001';
const API_BASE = import.meta.env.VITE_CHAT_API_URL || `http://localhost:${API_PORT}`;

type Config = {
    assistantName: string;
    companyName: string;
    greeting: string;
    webhookUrl?: string;
    webhookSecretConfigured?: boolean;
};

export default function ConfigPage() {
    const { tenantId } = useTenant();
    const [config, setConfig] = useState<Config | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [copiedPublicLink, setCopiedPublicLink] = useState(false);
    const [usage, setUsage] = useState<{ prompt_tokens: number; completion_tokens: number; total_tokens: number; estimated_cost_usd: number } | null>(null);
    const [usageLoading, setUsageLoading] = useState(false);
    const [usageFrom, setUsageFrom] = useState(() => {
        const d = new Date();
        d.setDate(1);
        return d.toISOString().slice(0, 10);
    });
    const [usageTo, setUsageTo] = useState(() => new Date().toISOString().slice(0, 10));

    useEffect(() => {
        setLoading(true);
        axios
            .get(`${API_BASE}/api/config`, { headers: { 'X-Tenant-Id': tenantId } })
            .then((res) => {
                setConfig(res.data);
                setError(null);
            })
            .catch((err: any) => {
                const isNetworkError = err?.code === 'ERR_NETWORK' || !err?.response;
                setError(isNetworkError
                    ? `Não foi possível conectar à API. Verifique se o servidor está rodando (ex.: npm run dev na pasta do backend, porta ${API_PORT}).`
                    : 'Não foi possível carregar a configuração.');
            })
            .finally(() => setLoading(false));
    }, [tenantId]);

    const handleCopyUrl = () => {
        if (!config?.webhookUrl) return;
        navigator.clipboard.writeText(config.webhookUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const fetchUsage = useCallback(() => {
        setUsageLoading(true);
        const from = usageFrom ? `${usageFrom}T00:00:00.000Z` : undefined;
        const to = usageTo ? `${usageTo}T23:59:59.999Z` : undefined;
        const params = new URLSearchParams({ tenantId: tenantId || 'default' });
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        axios
            .get(`${API_BASE}/api/usage?${params}`)
            .then((res) => setUsage(res.data))
            .catch(() => setUsage(null))
            .finally(() => setUsageLoading(false));
    }, [tenantId, usageFrom, usageTo]);

    useEffect(() => {
        if (!tenantId) return;
        fetchUsage();
    }, [tenantId, fetchUsage]);

    const publicChatUrl = typeof window !== 'undefined' ? `${window.location.origin}/t/${tenantId}` : '';
    const handleCopyPublicLink = () => {
        if (!publicChatUrl) return;
        navigator.clipboard.writeText(publicChatUrl).then(() => {
            setCopiedPublicLink(true);
            setTimeout(() => setCopiedPublicLink(false), 2000);
        });
    };

    if (loading) {
        return (
            <div className="p-6">
                <h1 className="text-xl font-semibold">Configuração</h1>
                <p className="text-gray-500 dark:text-gray-400 mt-2">Carregando...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6">
                <h1 className="text-xl font-semibold text-[#111b21] dark:text-[#e9edef]">Configuração</h1>
                <p className="text-red-500 mt-2">{error}</p>
                <button
                    type="button"
                    onClick={() => { setError(null); setLoading(true); window.location.reload(); }}
                    className="mt-3 text-sm text-[#00a884] hover:underline"
                >
                    Tentar novamente
                </button>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-xl font-semibold text-[#111b21] dark:text-[#e9edef]">Configuração</h1>

            <section className="mt-6 space-y-4">
                <h2 className="text-sm font-medium text-[#54656f] dark:text-[#aebac1]">Assistente</h2>
                <div className="rounded-lg border border-[#e9edef] dark:border-[#202c33] bg-white dark:bg-[#202c33] p-4 space-y-2">
                    <div>
                        <span className="text-xs text-[#54656f] dark:text-[#8696a0]">Nome do assistente</span>
                        <p className="text-[#111b21] dark:text-[#e9edef]">{config?.assistantName ?? '—'}</p>
                    </div>
                    <div>
                        <span className="text-xs text-[#54656f] dark:text-[#8696a0]">Empresa</span>
                        <p className="text-[#111b21] dark:text-[#e9edef]">{config?.companyName ?? '—'}</p>
                    </div>
                    <div>
                        <span className="text-xs text-[#54656f] dark:text-[#8696a0]">Saudação</span>
                        <p className="text-[#111b21] dark:text-[#e9edef] text-sm">{config?.greeting ?? '—'}</p>
                    </div>
                </div>
            </section>

            <section className="mt-8 space-y-4">
                <h2 className="text-sm font-medium text-[#54656f] dark:text-[#aebac1]">Link para teste pelo cliente</h2>
                <div className="rounded-lg border border-[#e9edef] dark:border-[#202c33] bg-white dark:bg-[#202c33] p-4 space-y-3">
                    <p className="text-sm text-[#111b21] dark:text-[#e9edef]">
                        Envie este link ao cliente para ele testar o chat na prática. Ao abrir, será exibido apenas o chat (sem menu nem configurações).
                    </p>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            readOnly
                            value={publicChatUrl}
                            className="flex-1 rounded border border-[#e9edef] dark:border-[#2a3942] bg-[#f0f2f5] dark:bg-[#111b21] px-3 py-2 text-sm text-[#111b21] dark:text-[#e9edef] font-mono"
                        />
                        <button
                            type="button"
                            onClick={handleCopyPublicLink}
                            className="flex items-center gap-2 rounded-lg bg-[#00a884] text-white px-3 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
                        >
                            {copiedPublicLink ? <Check size={16} /> : <Copy size={16} />}
                            {copiedPublicLink ? 'Copiado' : 'Copiar'}
                        </button>
                        <a
                            href={publicChatUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 rounded-lg border border-[#e9edef] dark:border-[#2a3942] px-3 py-2 text-sm font-medium text-[#111b21] dark:text-[#e9edef] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                        >
                            <ExternalLink size={16} />
                            Abrir
                        </a>
                    </div>
                </div>
            </section>

            <section className="mt-8 space-y-4">
                <h2 className="text-sm font-medium text-[#54656f] dark:text-[#aebac1] flex items-center gap-2">
                    <BarChart3 size={18} />
                    Uso de tokens e custo
                </h2>
                <div className="rounded-lg border border-[#e9edef] dark:border-[#202c33] bg-white dark:bg-[#202c33] p-4 space-y-4">
                    <p className="text-sm text-[#111b21] dark:text-[#e9edef]">
                        Consumo de tokens da IA e custo estimado (USD) para a empresa selecionada.
                    </p>
                    <div className="flex flex-wrap items-end gap-2">
                        <div>
                            <label className="block text-xs text-[#54656f] dark:text-[#8696a0] mb-1">De</label>
                            <input
                                type="date"
                                value={usageFrom}
                                onChange={(e) => setUsageFrom(e.target.value)}
                                className="rounded border border-[#e9edef] dark:border-[#2a3942] bg-[#f0f2f5] dark:bg-[#111b21] px-3 py-2 text-sm text-[#111b21] dark:text-[#e9edef]"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-[#54656f] dark:text-[#8696a0] mb-1">Até</label>
                            <input
                                type="date"
                                value={usageTo}
                                onChange={(e) => setUsageTo(e.target.value)}
                                className="rounded border border-[#e9edef] dark:border-[#2a3942] bg-[#f0f2f5] dark:bg-[#111b21] px-3 py-2 text-sm text-[#111b21] dark:text-[#e9edef]"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={fetchUsage}
                            disabled={usageLoading}
                            className="rounded-lg bg-[#00a884] text-white px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
                        >
                            {usageLoading ? 'Carregando…' : 'Atualizar'}
                        </button>
                    </div>
                    {usage && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-[#e9edef] dark:border-[#2a3942]">
                            <div>
                                <span className="text-xs text-[#54656f] dark:text-[#8696a0]">Tokens (entrada)</span>
                                <p className="text-lg font-medium text-[#111b21] dark:text-[#e9edef]">{usage.prompt_tokens.toLocaleString('pt-BR')}</p>
                            </div>
                            <div>
                                <span className="text-xs text-[#54656f] dark:text-[#8696a0]">Tokens (saída)</span>
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
                    )}
                </div>
            </section>

            <section className="mt-8 space-y-4">
                <h2 className="text-sm font-medium text-[#54656f] dark:text-[#aebac1]">Integração / Webhook</h2>
                <div className="rounded-lg border border-[#e9edef] dark:border-[#202c33] bg-white dark:bg-[#202c33] p-4 space-y-4">
                    <div>
                        <span className="text-xs text-[#54656f] dark:text-[#8696a0]">URL do webhook</span>
                        <div className="mt-1 flex items-center gap-2">
                            <input
                                type="text"
                                readOnly
                                value={config?.webhookUrl ?? ''}
                                className="flex-1 rounded border border-[#e9edef] dark:border-[#2a3942] bg-[#f0f2f5] dark:bg-[#111b21] px-3 py-2 text-sm text-[#111b21] dark:text-[#e9edef] font-mono"
                            />
                            <button
                                type="button"
                                onClick={handleCopyUrl}
                                className="flex items-center gap-2 rounded-lg bg-[#00a884] text-white px-3 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
                            >
                                {copied ? <Check size={16} /> : <Copy size={16} />}
                                {copied ? 'Copiado' : 'Copiar URL'}
                            </button>
                        </div>
                    </div>
                    <div>
                        <span className="text-xs text-[#54656f] dark:text-[#8696a0]">Segredo do webhook</span>
                        <p className="text-[#111b21] dark:text-[#e9edef] text-sm mt-1">
                            {config?.webhookSecretConfigured ? (
                                <span className="text-green-600 dark:text-green-400">Configurado</span>
                            ) : (
                                <span className="text-amber-600 dark:text-amber-400">Não configurado</span>
                            )}
                        </p>
                    </div>
                    <p className="text-xs text-[#54656f] dark:text-[#8696a0] border-t border-[#e9edef] dark:border-[#2a3942] pt-3">
                        No SouChat ou n8n, configure esta URL como webhook de mensagens. Método: <strong>POST</strong>. Body (JSON): <code className="bg-black/5 dark:bg-white/5 px-1 rounded">phone</code> e <code className="bg-black/5 dark:bg-white/5 px-1 rounded">message</code>.
                    </p>
                </div>
            </section>
        </div>
    );
}
