/**
 * Aba Histórico de conversas (só admin): lista sessões, abre timeline e "Nova conversa".
 */
import { useState, useEffect } from 'react';
import axios from 'axios';
import { MessageCirclePlus, MessageSquare, User } from 'lucide-react';
import { getAdminHeaders } from '../admin/AdminKeyPage';

const API_BASE = import.meta.env.VITE_CHAT_API_URL || `http://localhost:${import.meta.env.VITE_API_PORT || '3001'}`;

type SessionSummary = {
    phone: string;
    lastMessageAt: string;
    messageCount: number;
    lastPreview: string;
};

type ExecutionItem = {
    id: string;
    phone: string;
    message: string;
    reply: string;
    timestamp: string;
    assistantId?: string | null;
};

function formatTime(iso: string): string {
    try {
        return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
        return iso;
    }
}

type Props = {
    companyId: string;
    tenantId: string;
    onNewConversation: () => void;
};

export default function ChatHistoryTab({ companyId, tenantId, onNewConversation }: Props) {
    const [sessions, setSessions] = useState<SessionSummary[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
    const [timeline, setTimeline] = useState<ExecutionItem[]>([]);
    const [timelineLoading, setTimelineLoading] = useState(false);

    const loadSessions = () => {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({ tenantId: tenantId || 'default', limit: '50' });
        axios
            .get<{ items: SessionSummary[]; total: number }>(`${API_BASE}/api/admin/conversations?${params}`, { headers: getAdminHeaders() })
            .then((res) => {
                setSessions(res.data.items ?? []);
                setTotal(res.data.total ?? 0);
            })
            .catch(() => {
                setError('Não foi possível carregar o histórico.');
                setSessions([]);
                setTotal(0);
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadSessions();
    }, [companyId, tenantId]);

    useEffect(() => {
        if (!selectedPhone?.trim()) {
            setTimeline([]);
            return;
        }
        setTimelineLoading(true);
        const params = new URLSearchParams({ tenantId: tenantId || 'default', phone: selectedPhone.trim(), limit: '100' });
        axios
            .get<{ items: ExecutionItem[] }>(`${API_BASE}/api/admin/conversations/by-session?${params}`, { headers: getAdminHeaders() })
            .then((res) => setTimeline(res.data.items ?? []))
            .catch(() => setTimeline([]))
            .finally(() => setTimelineLoading(false));
    }, [selectedPhone, tenantId]);

    return (
        <div className="rounded-xl border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#202c33] overflow-hidden flex flex-col min-h-[400px]">
            <div className="flex items-center justify-between p-4 border-b border-[#e9edef] dark:border-[#2a3942]">
                <h2 className="text-lg font-semibold text-[#111b21] dark:text-[#e9edef]">Histórico de conversas</h2>
                <button
                    type="button"
                    onClick={onNewConversation}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#00a884] hover:bg-[#008f72] text-white text-sm font-medium transition-colors"
                >
                    <MessageCirclePlus size={18} />
                    Nova conversa
                </button>
            </div>
            <div className="flex flex-1 min-h-0">
                <div className="w-80 border-r border-[#e9edef] dark:border-[#2a3942] flex flex-col overflow-hidden">
                    {loading ? (
                        <div className="p-4 text-[#54656f] dark:text-[#aebac1] text-sm">Carregando…</div>
                    ) : error ? (
                        <div className="p-4 text-red-600 dark:text-red-400 text-sm">{error}</div>
                    ) : sessions.length === 0 ? (
                        <div className="p-4 text-[#54656f] dark:text-[#aebac1] text-sm">Nenhuma conversa ainda.</div>
                    ) : (
                        <ul className="overflow-y-auto flex-1">
                            {sessions.map((s) => (
                                <li key={s.phone}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedPhone(s.phone)}
                                        className={`w-full text-left px-4 py-3 border-b border-[#e9edef] dark:border-[#2a3942] hover:bg-[#f0f2f5] dark:hover:bg-[#2a3942] transition-colors ${selectedPhone === s.phone ? 'bg-[#00a884]/10 dark:bg-[#00a884]/20' : ''}`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-xs text-[#00a884] dark:text-[#2dd4bf]">{s.phone}</span>
                                            <span className="text-xs text-[#54656f] dark:text-[#aebac1]">{s.messageCount} msgs</span>
                                        </div>
                                        <p className="text-sm text-[#111b21] dark:text-[#e9edef] truncate mt-0.5">{s.lastPreview || '—'}</p>
                                        <p className="text-xs text-[#54656f] dark:text-[#aebac1] mt-0.5">{formatTime(s.lastMessageAt)}</p>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                    {!selectedPhone ? (
                        <div className="flex flex-col items-center justify-center h-full text-[#54656f] dark:text-[#aebac1] text-sm">
                            <MessageSquare size={48} className="mb-2 opacity-50" />
                            <p>Selecione uma conversa para ver o histórico.</p>
                        </div>
                    ) : timelineLoading ? (
                        <div className="text-[#54656f] dark:text-[#aebac1] text-sm">Carregando…</div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-sm text-[#54656f] dark:text-[#aebac1]">
                                <User size={16} />
                                Sessão: <span className="font-mono text-[#00a884] dark:text-[#2dd4bf]">{selectedPhone}</span>
                            </div>
                            {timeline.map((ex) => (
                                <div key={ex.id} className="space-y-1">
                                    <div className="flex justify-end">
                                        <div className="max-w-[85%] rounded-lg rounded-tr-none px-3 py-2 bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] text-sm">
                                            <p className="whitespace-pre-wrap">{ex.message}</p>
                                            <span className="text-[11px] text-[#54656f] dark:text-[#aebac1]">{formatTime(ex.timestamp)}</span>
                                        </div>
                                    </div>
                                    <div className="flex justify-start">
                                        <div className="max-w-[85%] rounded-lg rounded-tl-none px-3 py-2 bg-[#f0f2f5] dark:bg-[#2a3942] text-[#111b21] dark:text-[#e9edef] text-sm">
                                            {ex.assistantId && (
                                                <span className="text-[10px] text-[#00a884] dark:text-[#2dd4bf] block mb-0.5">agente: {ex.assistantId}</span>
                                            )}
                                            <p className="whitespace-pre-wrap">{ex.reply}</p>
                                            <span className="text-[11px] text-[#54656f] dark:text-[#aebac1]">{formatTime(ex.timestamp)}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
