import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useTenant } from '../context/TenantContext';

const API_PORT = import.meta.env.VITE_API_PORT || '3001';
const API_BASE = import.meta.env.VITE_CHAT_API_URL || `http://localhost:${API_PORT}`;

type Execution = {
    id: string;
    tenantId?: string;
    phone: string;
    message: string;
    reply: string;
    status: string;
    durationMs: number;
    timestamp: string;
    source: string;
    debug?: unknown;
    model?: string | null;
    temperature?: number | null;
};

type ChatMessage = { role: string; content?: string };
type WebhookDebug = {
    kind?: string;
    request?: {
        tenantId?: string;
        assistantId?: string | null;
        receivedAt?: string;
        headers?: Record<string, unknown>;
        body?: unknown;
    };
    response?: {
        status?: number;
        body?: unknown;
    };
    error?: {
        name?: string;
        message?: string;
    };
    chatDebug?: unknown;
};

function isMessagesArray(debug: unknown): debug is ChatMessage[] {
    return Array.isArray(debug) && debug.every((m) => m && typeof m === 'object' && 'role' in m);
}

function isWebhookDebug(debug: unknown): debug is WebhookDebug {
    if (!debug || typeof debug !== 'object' || Array.isArray(debug)) return false;
    const d = debug as Record<string, unknown>;
    return 'request' in d || 'response' in d || 'chatDebug' in d || d.kind === 'webhook';
}

export default function ExecutionDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { tenantId } = useTenant();
    const [exec, setExec] = useState<Execution | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) {
            setLoading(false);
            return;
        }
        const tid = tenantId || 'default';
        const headers = { 'X-Tenant-Id': tid };
        axios
            .get(`${API_BASE}/api/executions/${id}?tenant=${encodeURIComponent(tid)}`, { headers })
            .then((res) => {
                setExec(res.data);
                setError(null);
            })
            .catch((err: any) => {
                if (err.response?.status === 404) {
                    setError('Execução não encontrada.');
                } else if (err?.code === 'ERR_NETWORK' || !err?.response) {
                    setError(`Não foi possível conectar à API. Verifique se o servidor está rodando (porta ${API_PORT}).`);
                } else {
                    setError('Não foi possível carregar o detalhe.');
                }
            })
            .finally(() => setLoading(false));
    }, [id, tenantId]);

    const formatDate = (iso: string) => {
        try {
            return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'medium' });
        } catch {
            return iso;
        }
    };

    if (loading) {
        return (
            <div className="p-4">
                <h1 className="text-xl font-semibold">Detalhe da execução</h1>
                <p className="text-gray-500 dark:text-gray-400 mt-2">Carregando...</p>
            </div>
        );
    }

    if (error || !exec) {
        return (
            <div className="p-4">
                <h1 className="text-xl font-semibold">Detalhe da execução</h1>
                <p className="text-red-500 mt-2">{error ?? 'Execução não encontrada.'}</p>
                <button type="button" onClick={() => navigate(-1)} className="mt-4 text-[#00a884] hover:underline text-sm font-medium">
                    Voltar à lista
                </button>
            </div>
        );
    }

    const chatDebug =
        isMessagesArray(exec.debug)
            ? exec.debug
            : isWebhookDebug(exec.debug) && isMessagesArray(exec.debug.chatDebug)
                ? exec.debug.chatDebug
                : null;
    const webhookDebug = isWebhookDebug(exec.debug) ? exec.debug : null;

    return (
        <div className="w-full p-4">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-xl font-semibold text-[#111b21] dark:text-[#e9edef]">Detalhe da execução</h1>
                <div className="flex items-center gap-3">
                    {exec.tenantId && exec.phone && (
                        <Link
                            to={`/empresas/${encodeURIComponent(exec.tenantId)}/conversas?phone=${encodeURIComponent(exec.phone)}`}
                            className="text-sm text-[#00a884] hover:underline font-medium"
                        >
                            Ver conversa desta sessão
                        </Link>
                    )}
                    <button type="button" onClick={() => navigate(-1)} className="text-sm text-[#00a884] hover:underline font-medium">
                        Voltar à lista
                    </button>
                </div>
            </div>

            <div className="space-y-6">
                <section className="rounded-lg border border-[#e9edef] dark:border-[#202c33] bg-white dark:bg-[#202c33] p-4">
                    <h2 className="text-sm font-medium text-[#54656f] dark:text-[#aebac1] mb-3">Resumo</h2>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                        <div>
                            <dt className="text-[#54656f] dark:text-[#8696a0]">ID</dt>
                            <dd className="text-[#111b21] dark:text-[#e9edef] font-mono text-xs">{exec.id}</dd>
                        </div>
                        <div>
                            <dt className="text-[#54656f] dark:text-[#8696a0]">Data/Hora</dt>
                            <dd className="text-[#111b21] dark:text-[#e9edef]">{formatDate(exec.timestamp)}</dd>
                        </div>
                        {exec.tenantId != null && exec.tenantId !== '' && (
                            <div>
                                <dt className="text-[#54656f] dark:text-[#8696a0]">Tenant / Empresa</dt>
                                <dd className="text-[#111b21] dark:text-[#e9edef] font-mono">{exec.tenantId}</dd>
                            </div>
                        )}
                        <div>
                            <dt className="text-[#54656f] dark:text-[#8696a0]">Phone</dt>
                            <dd className="text-[#111b21] dark:text-[#e9edef] font-mono">{exec.phone}</dd>
                        </div>
                        <div>
                            <dt className="text-[#54656f] dark:text-[#8696a0]">Status</dt>
                            <dd>
                                <span
                                    className={
                                        exec.status === 'ok'
                                            ? 'text-green-600 dark:text-green-400'
                                            : 'text-red-600 dark:text-red-400'
                                    }
                                >
                                    {exec.status}
                                </span>
                            </dd>
                        </div>
                        <div>
                            <dt className="text-[#54656f] dark:text-[#8696a0]">Duração (ms)</dt>
                            <dd className="text-[#111b21] dark:text-[#e9edef]">{exec.durationMs}</dd>
                        </div>
                        <div>
                            <dt className="text-[#54656f] dark:text-[#8696a0]">Origem</dt>
                            <dd className="text-[#111b21] dark:text-[#e9edef]">{exec.source}</dd>
                        </div>
                        {(exec.model != null && exec.model !== '') && (
                            <div>
                                <dt className="text-[#54656f] dark:text-[#8696a0]">Modelo IA</dt>
                                <dd className="text-[#111b21] dark:text-[#e9edef] font-mono text-xs">{exec.model}</dd>
                            </div>
                        )}
                        {exec.temperature != null && (
                            <div>
                                <dt className="text-[#54656f] dark:text-[#8696a0]">Temperatura</dt>
                                <dd className="text-[#111b21] dark:text-[#e9edef]">{exec.temperature}</dd>
                            </div>
                        )}
                    </dl>
                </section>

                <section className="rounded-lg border border-[#e9edef] dark:border-[#202c33] bg-white dark:bg-[#202c33] p-4">
                    <h2 className="text-sm font-medium text-[#54656f] dark:text-[#aebac1] mb-2">Payload de entrada</h2>
                    <div className="mb-3">
                        <span className="text-xs text-[#54656f] dark:text-[#8696a0]">Mensagem</span>
                        <pre className="mt-1 p-3 rounded bg-[#f0f2f5] dark:bg-[#111b21] text-sm text-[#111b21] dark:text-[#e9edef] whitespace-pre-wrap break-words">
                            {exec.message}
                        </pre>
                    </div>
                </section>

                <section className="rounded-lg border border-[#e9edef] dark:border-[#202c33] bg-white dark:bg-[#202c33] p-4">
                    <h2 className="text-sm font-medium text-[#54656f] dark:text-[#aebac1] mb-2">Resposta</h2>
                    <pre className="p-3 rounded bg-[#f0f2f5] dark:bg-[#111b21] text-sm text-[#111b21] dark:text-[#e9edef] whitespace-pre-wrap break-words">
                        {exec.reply}
                    </pre>
                </section>

                {webhookDebug && (
                    <section className="rounded-lg border border-[#e9edef] dark:border-[#202c33] bg-white dark:bg-[#202c33] p-4">
                        <h2 className="text-sm font-medium text-[#54656f] dark:text-[#aebac1] mb-2">Webhook — recebimento e retorno</h2>
                        <p className="text-xs text-[#54656f] dark:text-[#8696a0] mb-3">
                            Dados recebidos no webhook e resposta devolvida, úteis para debug de integração.
                        </p>
                        {webhookDebug.request && (
                            <div className="mb-3">
                                <h3 className="text-xs font-medium text-[#54656f] dark:text-[#8696a0] mb-1">Recebido (request)</h3>
                                <pre className="p-3 rounded bg-[#f0f2f5] dark:bg-[#111b21] text-xs text-[#111b21] dark:text-[#e9edef] overflow-x-auto max-h-[260px] overflow-y-auto whitespace-pre-wrap break-words">
                                    {JSON.stringify(webhookDebug.request, null, 2)}
                                </pre>
                            </div>
                        )}
                        {webhookDebug.response && (
                            <div className="mb-3">
                                <h3 className="text-xs font-medium text-[#54656f] dark:text-[#8696a0] mb-1">Retornado (response)</h3>
                                <pre className="p-3 rounded bg-[#f0f2f5] dark:bg-[#111b21] text-xs text-[#111b21] dark:text-[#e9edef] overflow-x-auto max-h-[220px] overflow-y-auto whitespace-pre-wrap break-words">
                                    {JSON.stringify(webhookDebug.response, null, 2)}
                                </pre>
                            </div>
                        )}
                        {webhookDebug.error && (
                            <div>
                                <h3 className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">Erro processado</h3>
                                <pre className="p-3 rounded bg-red-50 dark:bg-red-900/20 text-xs text-[#111b21] dark:text-[#e9edef] overflow-x-auto whitespace-pre-wrap break-words">
                                    {JSON.stringify(webhookDebug.error, null, 2)}
                                </pre>
                            </div>
                        )}
                    </section>
                )}

                {chatDebug && (
                    <>
                        <section className="rounded-lg border border-[#e9edef] dark:border-[#202c33] bg-white dark:bg-[#202c33] p-4">
                            <h2 className="text-sm font-medium text-[#54656f] dark:text-[#aebac1] mb-2">Prompt do sistema utilizado</h2>
                            <p className="text-xs text-[#54656f] dark:text-[#8696a0] mb-2">
                                Conteúdo enviado como mensagem de sistema à IA nesta execução.
                            </p>
                            <pre className="p-3 rounded bg-[#e8f4f0] dark:bg-[#0d1f1a] text-sm text-[#111b21] dark:text-[#e9edef] whitespace-pre-wrap break-words max-h-[320px] overflow-y-auto border border-[#00a884]/30 dark:border-[#00a884]/40">
                                {chatDebug.find((m) => m.role === 'system')?.content ?? '(não disponível)'}
                            </pre>
                        </section>
                        <section className="rounded-lg border border-[#e9edef] dark:border-[#202c33] bg-white dark:bg-[#202c33] p-4">
                            <h2 className="text-sm font-medium text-[#54656f] dark:text-[#aebac1] mb-2">Mensagens enviadas à IA (ordem)</h2>
                            <p className="text-xs text-[#54656f] dark:text-[#8696a0] mb-3">
                                Sequência completa de mensagens (system, user, assistant) usada na chamada ao modelo.
                            </p>
                            <ul className="space-y-3">
                                {chatDebug.map((m, i) => (
                                    <li key={i} className="rounded border border-[#e9edef] dark:border-[#202c33] overflow-hidden">
                                        <div className="px-2 py-1 text-xs font-medium bg-[#f0f2f5] dark:bg-[#111b21] text-[#54656f] dark:text-[#8696a0] capitalize">
                                            {m.role}
                                        </div>
                                        <pre className="p-3 bg-white dark:bg-[#202c33] text-sm text-[#111b21] dark:text-[#e9edef] whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto">
                                            {typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? m)}
                                        </pre>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    </>
                )}

                {exec.debug != null && (
                    <section className="rounded-lg border border-[#e9edef] dark:border-[#202c33] bg-white dark:bg-[#202c33] p-4">
                        <h2 className="text-sm font-medium text-[#54656f] dark:text-[#aebac1] mb-2">Debug (JSON bruto)</h2>
                        <p className="text-xs text-[#54656f] dark:text-[#8696a0] mb-2">
                            Dados completos de debug para inspeção.
                        </p>
                        <pre className="p-3 rounded bg-[#f0f2f5] dark:bg-[#111b21] text-xs text-[#111b21] dark:text-[#e9edef] overflow-x-auto max-h-[400px] overflow-y-auto whitespace-pre-wrap break-words">
                            {JSON.stringify(exec.debug, null, 2)}
                        </pre>
                    </section>
                )}
            </div>
        </div>
    );
}
