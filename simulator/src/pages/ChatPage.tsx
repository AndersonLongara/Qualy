import { useState, useEffect, useRef } from 'react';
import { Send, MoreVertical, Search, Paperclip, Smile, Mic, Check, CheckCheck, Moon, Sun, ArrowLeft, MessageCirclePlus } from 'lucide-react';
import axios from 'axios';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useTenant } from '../context/TenantContext';
import { useTheme } from '../context/ThemeContext';
import { getAdminHeaders } from './admin/AdminKeyPage';

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

type Message = {
    id: string;
    role: 'bot' | 'user';
    text: string;
    timestamp: string;
    status?: 'sent' | 'delivered' | 'read';
    /** Quando true, exibe como bloco central de transferência (não como bolha do bot). */
    isHandoffNotification?: boolean;
};

const themes = {
    light: {
        outerBg: 'bg-[#d1d7db]',
        headerBg: 'bg-[#f0f2f5]',
        sidebarBg: 'bg-white',
        sidebarBorder: 'border-[#e9edef]',
        searchBg: 'bg-[#f0f2f5]',
        activeChatBg: 'bg-[#f0f2f5]',
        chatBg: 'bg-[#efeae2]',
        inputBg: 'bg-[#f0f2f5]',
        inputFieldBg: 'bg-white',
        msgBotBg: 'bg-white',
        msgUserBg: 'bg-[#d9fdd3]',
        msgBotTail: 'border-t-white',
        msgUserTail: 'border-t-[#d9fdd3]',
        text: 'text-[#111b21]',
        subText: 'text-[#54656f]',
        smallText: 'text-[#667781]',
        iconColor: 'text-[#54656f]',
        dotBorder: 'border-white',
        greenStrip: 'bg-[#00a884]',
        noticeText: 'text-[#54656f]',
        noticeBg: 'bg-[#fff5c4]',
        skeletonBlock: 'bg-gray-200',
        skeletonAlt: 'bg-gray-100',
        inputText: 'text-[#111b21] placeholder-[#54656f]',
    },
    dark: {
        outerBg: 'bg-[#111b21]',
        headerBg: 'bg-[#202c33]',
        sidebarBg: 'bg-[#111b21]',
        sidebarBorder: 'border-[#202c33]',
        searchBg: 'bg-[#202c33]',
        activeChatBg: 'bg-[#2a3942]',
        chatBg: 'bg-[#0b141a]',
        inputBg: 'bg-[#202c33]',
        inputFieldBg: 'bg-[#2a3942]',
        msgBotBg: 'bg-[#202c33]',
        msgUserBg: 'bg-[#005c4b]',
        msgBotTail: 'border-t-[#202c33]',
        msgUserTail: 'border-t-[#005c4b]',
        text: 'text-[#e9edef]',
        subText: 'text-[#aebac1]',
        smallText: 'text-[#8696a0]',
        iconColor: 'text-[#aebac1]',
        dotBorder: 'border-[#111b21]',
        greenStrip: 'bg-[#005c4b]',
        noticeText: 'text-[#e9edef]',
        noticeBg: 'bg-[#182229]',
        skeletonBlock: 'bg-gray-700',
        skeletonAlt: 'bg-gray-800',
        inputText: 'text-[#e9edef] placeholder-[#8696a0]',
    },
};

const API_PORT = import.meta.env.VITE_API_PORT || '3001';
const CHAT_API_BASE = import.meta.env.VITE_CHAT_API_URL || `http://localhost:${API_PORT}`;

const STORAGE_SESSION_ID = 'qualy_session_id';
const storageChatKey = (tenantId: string, sessionId: string) => `qualy_chat_${tenantId}_${sessionId}`;
const storageAgentKey = (tenantId: string, sessionId: string) => `qualy_agent_${tenantId}_${sessionId}`;

const MessageIcon = () => (
    <svg viewBox="0 0 24 24" height="20" width="20" fill="currentColor">
        <path d="M19.005,3.175H4.674C3.642,3.175,3,3.789,3,4.821V21.02l3.544-3.514h12.461c1.033,0,2.064-1.06,2.064-2.093V4.821C21.068,3.789,20.037,3.175,19.005,3.175z" />
    </svg>
);

type SessionSummary = { phone: string; lastMessageAt: string; messageCount: number; lastPreview: string };

type ChatPageProps = { assistantId?: string; /** No preview do admin: mostra lista de conversas na sidebar (incluindo a anterior ao criar nova). */ showConversationList?: boolean };

export default function ChatPage({ assistantId, showConversationList = false }: ChatPageProps = {}) {
    const { tenantId } = useTenant();
    const [config, setConfig] = useState<{ assistantName: string; companyName: string; greeting: string }>({
        assistantName: 'AltraIA',
        companyName: 'AltraIA',
        greeting: 'Olá! Sou a AltraIA, assistente virtual. Como posso ajudar hoje?',
    });
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const [sessionId, setSessionId] = useState(() => {
        const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_SESSION_ID) : null;
        if (stored) return stored;
        const id = Math.random().toString(36).substring(2, 8).toUpperCase();
        if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_SESSION_ID, id);
        return id;
    });
    /** Agente ativo: pode mudar via handoff durante o atendimento. */
    const [activeAgentId, setActiveAgentId] = useState<string | undefined>(assistantId);
    const [conversationList, setConversationList] = useState<SessionSummary[]>([]);
    const { isDark, toggleTheme } = useTheme();

    const t = isDark ? themes.dark : themes.light;
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Sincronizar com o agente da página só quando NÃO houver agente salvo para esta conversa (evita sobrescrever vendedor ao abrir conversa transferida)
    useEffect(() => {
        const tid = tenantId || 'default';
        const agentKey = storageAgentKey(tid, sessionId);
        try {
            const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(agentKey)?.trim() : null;
            if (stored) return;
        } catch {
            /* ignore */
        }
        setActiveAgentId(assistantId);
    }, [assistantId, tenantId, sessionId]);

    // Persistência: carregar histórico e agente ativo ao trocar sessão (tenantId + sessionId)
    useEffect(() => {
        const tid = tenantId || 'default';
        const chatKey = storageChatKey(tid, sessionId);
        const agentKey = storageAgentKey(tid, sessionId);
        try {
            const savedChat = localStorage.getItem(chatKey);
            if (savedChat) {
                const parsed = JSON.parse(savedChat) as Message[];
                setMessages(Array.isArray(parsed) ? parsed : []);
            } else {
                setMessages([]);
            }
            const savedAgent = localStorage.getItem(agentKey);
            if (savedAgent?.trim()) setActiveAgentId(savedAgent.trim());
        } catch {
            setMessages([]);
        }
    }, [tenantId, sessionId]);

    // Persistência: salvar mensagens sempre que mudarem
    useEffect(() => {
        const tid = tenantId || 'default';
        const chatKey = storageChatKey(tid, sessionId);
        try {
            if (messages.length > 0) localStorage.setItem(chatKey, JSON.stringify(messages));
            else localStorage.removeItem(chatKey);
        } catch {
            /* ignore */
        }
    }, [tenantId, sessionId, messages]);

    // Persistência: salvar agente ativo quando mudar
    useEffect(() => {
        const tid = tenantId || 'default';
        const agentKey = storageAgentKey(tid, sessionId);
        try {
            if (activeAgentId?.trim()) localStorage.setItem(agentKey, activeAgentId.trim());
            else localStorage.removeItem(agentKey);
        } catch {
            /* ignore */
        }
    }, [tenantId, sessionId, activeAgentId]);

    useEffect(() => {
        const headers: Record<string, string> = { 'X-Tenant-Id': tenantId || 'default' };
        if (activeAgentId?.trim()) headers['X-Assistant-Id'] = activeAgentId.trim();
        axios.get(`${CHAT_API_BASE}/api/config`, { headers }).then((res) => {
            if (res.data?.assistantName != null || res.data?.companyName != null || res.data?.greeting != null) {
                setConfig({
                    assistantName: res.data.assistantName ?? 'AltraIA',
                    companyName: res.data.companyName ?? 'AltraIA',
                    greeting: res.data.greeting ?? 'Olá! Sou a AltraIA, assistente virtual. Como posso ajudar hoje?',
                });
            }
        }).catch(() => { /* fallback */ });
    }, [tenantId, activeAgentId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    const fetchConversationList = () => {
        if (!showConversationList) return;
        const tid = tenantId || 'default';
        const params = new URLSearchParams({ tenantId: tid, limit: '50' });
        axios
            .get<{ items: SessionSummary[] }>(`${CHAT_API_BASE}/api/admin/conversations?${params}`, { headers: getAdminHeaders() })
            .then((res) => setConversationList(res.data.items ?? []))
            .catch(() => setConversationList([]));
    };

    useEffect(() => {
        fetchConversationList();
    }, [showConversationList, tenantId]);

    const startNewConversation = () => {
        const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
        if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_SESSION_ID, newId);
        setSessionId(newId);
        setMessages([]);
        setActiveAgentId(assistantId);
        if (showConversationList) setTimeout(fetchConversationList, 300);
    };

    const handleSend = async () => {
        if (!input.trim()) return;
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            text: input,
            timestamp,
            status: 'sent',
        };
        setMessages((prev) => [...prev, userMsg]);
        setInput('');
        setLoading(true);
        setIsTyping(true);
        try {
            const history = messages.slice(-10).map((msg) => ({
                role: msg.role === 'bot' ? 'assistant' : 'user',
                content: msg.text,
            }));
            const minDelay = new Promise((resolve) => setTimeout(resolve, 1500));
            const headers: Record<string, string> = { 'X-Tenant-Id': tenantId || 'default' };
            if (activeAgentId?.trim()) headers['X-Assistant-Id'] = activeAgentId.trim();
            const apiCall = axios.post(
                `${CHAT_API_BASE}/api/chat`,
                { message: userMsg.text, history, phone: sessionId, ...(activeAgentId?.trim() ? { assistantId: activeAgentId.trim() } : {}) },
                { headers }
            );
            const [response] = await Promise.all([apiCall, minDelay]);
            if (response.data.effectiveAssistantId?.trim() && response.data.effectiveAssistantId !== activeAgentId) {
                setActiveAgentId(response.data.effectiveAssistantId.trim());
            }
            if (response.data.debug) {
                console.info('%c[DEBUG-AI] Histórico Técnico:', 'color: #00a884; font-weight: bold;', response.data.debug);
            }
            const botMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'bot',
                text: response.data.reply || 'Desculpe, não entendi.',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };
            setMessages((prev) => [...prev, botMsg]);

            // Handoff: troca o agente ativo, exibe notificação e primeira mensagem do novo agente (com contexto)
            if (response.data.handoff?.targetAgentId) {
                const { targetAgentId, transitionMessage, initialReply } = response.data.handoff;
                const notificationMsg: Message = {
                    id: (Date.now() + 2).toString(),
                    role: 'bot',
                    text: transitionMessage
                        ? `Transferido para o agente **${targetAgentId}**. ${transitionMessage}`
                        : `Atendimento transferido para o agente **${targetAgentId}**. As próximas mensagens serão atendidas por ele.`,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    isHandoffNotification: true,
                };
                setMessages((prev) => [...prev, notificationMsg]);
                setActiveAgentId(targetAgentId);
                if (initialReply?.trim()) {
                    const newAgentMsg: Message = {
                        id: (Date.now() + 3).toString(),
                        role: 'bot',
                        text: initialReply.trim(),
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    };
                    setMessages((prev) => [...prev, newAgentMsg]);
                }
            }
        } catch {
            setMessages((prev) => [
                ...prev,
                {
                    id: (Date.now() + 1).toString(),
                    role: 'bot',
                    text: 'Erro de conexão com o servidor.',
                    timestamp: new Date().toLocaleTimeString(),
                },
            ]);
        } finally {
            setLoading(false);
            setIsTyping(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className={cn('relative flex h-full min-h-0 w-full overflow-hidden font-sans antialiased transition-colors duration-300', t.outerBg, t.text)}>
            <div className={cn('absolute top-0 left-0 right-0 h-16 z-0 hidden md:block transition-colors duration-300', t.greenStrip)} />
            <div className={cn('z-10 flex h-full min-h-0 w-full max-w-[1700px] md:h-full md:min-h-0 md:my-0 md:mx-auto md:shadow-2xl md:flex-row md:overflow-hidden md:rounded-lg border', t.sidebarBorder)}>
                <div className={cn('hidden md:flex md:w-[380px] lg:w-[420px] flex-col min-h-0 border-r transition-colors duration-300 shrink-0', t.sidebarBg, t.sidebarBorder)}>
                    <div className={cn('h-[59px] flex items-center justify-between px-4 py-2.5 transition-colors duration-300', t.headerBg)}>
                        <div className="w-10 h-10 rounded-full bg-gray-400 flex items-center justify-center overflow-hidden">
                            <img src="https://ui-avatars.com/api/?name=Wesley+S&background=random" alt="User" />
                        </div>
                        <div className={cn('flex gap-5', t.iconColor)}>
                            <button onClick={toggleTheme} className="hover:opacity-70 transition-opacity">
                                {isDark ? <Sun size={20} /> : <Moon size={20} />}
                            </button>
                            <button className="hover:opacity-70 transition-opacity"><MessageIcon /></button>
                            <button className="hover:opacity-70 transition-opacity"><MoreVertical size={20} /></button>
                        </div>
                    </div>
                    <div className={cn('h-[49px] flex items-center px-3 border-b transition-colors duration-300', t.sidebarBg, t.sidebarBorder)}>
                        <div className={cn('flex items-center w-full rounded-lg px-3 py-1.5 h-[35px]', t.searchBg)}>
                            <Search size={18} className={cn('mr-4 ml-2', t.subText)} />
                            <input type="text" placeholder="Pesquisar ou começar uma nova conversa" className={cn('w-full bg-transparent outline-none text-sm', t.text, t.subText)} />
                        </div>
                    </div>
                    <div className={cn('flex-1 min-h-0 overflow-y-auto overflow-x-hidden transition-colors duration-300', t.sidebarBg)}>
                        <div className={cn("flex items-center px-3 py-3 cursor-pointer shrink-0", t.activeChatBg)}>
                            <div className={cn('relative w-[49px] h-[49px] rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-xl mr-3 flex-shrink-0')}>
                                Q
                                <div className={cn('absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2', t.dotBorder)} />
                            </div>
                            <div className={cn('flex-1 border-b pb-3 flex flex-col justify-center', t.sidebarBorder)}>
                                <div className="flex justify-between items-baseline">
                                    <h3 className={cn('text-[17px] font-normal flex items-center gap-2', t.text)}>
                                        {config.assistantName} Assistant
                                        <span className={cn('text-[10px] bg-gray-500/20 text-gray-500 px-1.5 py-0.5 rounded font-mono')}>ID: {sessionId}</span>
                                    </h3>
                                    <span className={cn('text-xs', t.smallText)}>{messages[messages.length - 1]?.timestamp}</span>
                                </div>
                                <p className={cn('text-[14px] truncate w-[220px]', t.subText)}>
                                    {isTyping ? <span className="text-emerald-500 font-medium">digitando...</span> : messages[messages.length - 1]?.text}
                                </p>
                            </div>
                        </div>
                        {showConversationList
                            ? conversationList
                                .filter((s) => s.phone !== sessionId)
                                .map((s) => (
                                    <button
                                        key={s.phone}
                                        type="button"
                                        onClick={() => setSessionId(s.phone)}
                                        className={cn('w-full flex items-center px-3 py-3 text-left border-b transition-colors hover:bg-black/5 dark:hover:bg-white/5 shrink-0', t.sidebarBorder)}
                                    >
                                        <div className={cn('w-[49px] h-[49px] rounded-full bg-emerald-600/80 flex items-center justify-center text-white font-bold text-sm mr-3 flex-shrink-0')}>Q</div>
                                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                                            <div className="flex items-center gap-2">
                                                <span className={cn('text-[10px] font-mono text-[#00a884] dark:text-[#2dd4bf]')}>{s.phone}</span>
                                                <span className={cn('text-xs', t.smallText)}>{s.messageCount} msgs</span>
                                            </div>
                                            <p className={cn('text-[14px] truncate', t.subText)}>{s.lastPreview || '—'}</p>
                                            <span className={cn('text-[11px]', t.smallText)}>{new Date(s.lastMessageAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                    </button>
                                ))
                            : [1, 2, 3].map((i) => (
                                <div key={i} className="flex items-center px-3 py-3 cursor-pointer opacity-40 shrink-0">
                                    <div className={cn('w-[49px] h-[49px] rounded-full mr-3', t.skeletonBlock)} />
                                    <div className={cn('flex-1 border-b pb-3 flex flex-col gap-2 justify-center', t.sidebarBorder)}>
                                        <div className={cn('w-32 h-4 rounded', t.skeletonBlock)} />
                                        <div className={cn('w-48 h-3 rounded', t.skeletonAlt)} />
                                    </div>
                                </div>
                            ))}
                    </div>
                </div>
                <div className={cn('flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden relative transition-colors duration-300', t.chatBg)}>
                    <div className={cn('h-[59px] flex items-center justify-between px-4 py-2.5 z-10 border-l transition-colors duration-300', t.headerBg, t.sidebarBorder)}>
                        <div className="flex items-center gap-3 cursor-pointer">
                            <div className={cn('md:hidden', t.iconColor)}><ArrowLeft /></div>
                            <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold">Q</div>
                            <div className="flex flex-col">
                                <span className={cn('font-medium leading-tight flex items-center gap-2', t.text)}>
                                    {config.assistantName} Assistant
                                    {activeAgentId && (
                                        <span className={cn('text-[10px] bg-[#00a884]/20 text-[#0d9488] dark:text-[#2dd4bf] px-1.5 py-0.5 rounded font-mono')}>
                                            agente: {activeAgentId}
                                        </span>
                                    )}
                                    <span className={cn('text-[10px] bg-gray-500/20 text-gray-500 px-1.5 py-0.5 rounded font-mono')}>ID: {sessionId}</span>
                                </span>
                                {isTyping ? <span className="text-xs text-emerald-500 font-medium">digitando...</span> : <span className={cn('text-xs', t.subText)}>Online para Negócios</span>}
                            </div>
                        </div>
                        <div className={cn('flex items-center gap-2', t.iconColor)}>
                            <button
                                type="button"
                                onClick={startNewConversation}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                                title="Nova conversa (zerar e começar do zero)"
                            >
                                <MessageCirclePlus size={18} />
                                <span className="hidden sm:inline">Nova conversa</span>
                            </button>
                            <button className="md:hidden hover:opacity-70 transition-opacity" onClick={toggleTheme}>
                                {isDark ? <Sun size={20} /> : <Moon size={20} />}
                            </button>
                            <Search size={20} className="cursor-pointer hover:opacity-70 transition-opacity" />
                            <MoreVertical size={20} className="cursor-pointer hover:opacity-70 transition-opacity" />
                        </div>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto p-4 z-10 custom-scrollbar">
                        <div className="flex justify-center mb-6">
                            <span className={cn('text-xs px-3 py-1.5 rounded-lg shadow-sm text-center max-w-[90%]', t.noticeBg, t.noticeText)}>
                                {activeAgentId
                                    ? `Conversa com o agente: ${activeAgentId}. As mensagens são processadas pela IA.`
                                    : `As mensagens desta conversa são processadas pela IA da ${config.assistantName}.`}
                            </span>
                        </div>
                        {messages.map((msg) =>
                            msg.isHandoffNotification ? (
                                <div key={msg.id} className="flex w-full justify-center my-3">
                                    <div className={cn(
                                        'max-w-[85%] md:max-w-[65%] px-4 py-3 rounded-lg border-2 text-center text-sm font-medium',
                                        'bg-[#00a884]/15 dark:bg-[#00a884]/25 border-[#00a884]/50 dark:border-[#2dd4bf]/50',
                                        'text-[#0d9488] dark:text-[#2dd4bf]'
                                    )}>
                                        <span className="block mb-0.5">⟳ Transferência de atendimento</span>
                                        <div className="whitespace-pre-wrap">{msg.text.replace(/\*\*/g, '').trim()}</div>
                                        <span className={cn('text-[11px] block mt-1', t.smallText)}>{msg.timestamp}</span>
                                    </div>
                                </div>
                            ) : (
                                <div key={msg.id} className={cn('flex w-full mb-1', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                                    <div className={cn(
                                        'relative max-w-[85%] md:max-w-[65%] px-2 py-1.5 rounded-lg shadow-sm text-sm leading-relaxed transition-colors duration-300',
                                        msg.role === 'user' ? cn(t.msgUserBg, 'rounded-tr-none') : cn(t.msgBotBg, 'rounded-tl-none'),
                                        t.text
                                    )}>
                                        <span className={cn(
                                            'absolute top-0 w-0 h-0 border-[6px] border-transparent',
                                            msg.role === 'user' ? cn('right-[-6px]', t.msgUserTail) : cn('left-[-6px]', t.msgBotTail)
                                        )} />
                                        <div className="whitespace-pre-wrap pl-1 pr-1 pb-1">{msg.text}</div>
                                        <div className="flex justify-end items-center gap-1 -mt-1 -mr-1">
                                            <span className={cn('text-[11px] min-w-[40px] text-right', t.smallText)}>{msg.timestamp}</span>
                                            {msg.role === 'user' && (msg.status === 'read' ? <CheckCheck size={14} className="text-[#53bdeb]" /> : <Check size={14} className={t.smallText} />)}
                                        </div>
                                    </div>
                                </div>
                            )
                        )}
                        {isTyping && (
                            <div className="flex w-full mb-1 justify-start">
                                <div className={cn('relative rounded-lg rounded-tl-none px-4 py-3 shadow-sm transition-colors duration-300', t.msgBotBg)}>
                                    <span className={cn('absolute top-0 left-[-6px] w-0 h-0 border-[6px] border-transparent', t.msgBotTail)} />
                                    <div className="flex gap-1">
                                        {['-0.3s', '-0.15s', '0s'].map((d) => (
                                            <div key={d} style={{ animationDelay: d }} className={cn('w-1.5 h-1.5 rounded-full animate-bounce', t.smallText, isDark ? 'bg-[#8696a0]' : 'bg-[#667781]')} />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                    <div className={cn('min-h-[62px] flex items-center px-4 py-2 gap-3 z-20 transition-colors duration-300', t.inputBg)}>
                        <Smile size={24} className={cn('cursor-pointer hover:opacity-70 transition-opacity', t.iconColor)} />
                        <Paperclip size={24} className={cn('cursor-pointer hover:opacity-70 transition-opacity', t.iconColor)} />
                        <div className={cn('flex-1 rounded-lg flex items-center px-4 py-2 transition-colors duration-300', t.inputFieldBg)}>
                            <input
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Mensagem"
                                className={cn('w-full bg-transparent outline-none text-[15px]', t.text)}
                            />
                        </div>
                        {input.trim() ? (
                            <button onClick={handleSend} disabled={loading} className={cn('p-2 disabled:opacity-50 transition-opacity', t.iconColor)}>
                                <Send size={24} />
                            </button>
                        ) : (
                            <Mic size={24} className={cn('cursor-pointer hover:opacity-70 transition-opacity', t.iconColor)} />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
