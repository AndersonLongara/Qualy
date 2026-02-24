/**
 * Página pública do chat por empresa: apenas o chat, sem navegação.
 * Rota: /t/:tenantId — link compartilhável para o cliente testar.
 * Rota alternativa: /t/:tenantId/:agentId — link direto para um agente específico.
 * O entryAgentId vem da config do tenant (chatFlow.entryAgentId) se não houver agentId na URL.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { useTenant } from '../context/TenantContext';
import ChatPage from './ChatPage';

const API_BASE = import.meta.env.VITE_CHAT_API_URL || `http://localhost:${import.meta.env.VITE_API_PORT || '3001'}`;

export default function PublicChatPage() {
    const { tenantId: tenantFromUrl, agentId: agentFromUrl } = useParams<{ tenantId: string; agentId?: string }>();
    const { setTenantId } = useTenant();
    const [status, setStatus] = useState<'loading' | 'ok' | 'invalid' | 'notfound'>('loading');
    const [resolvedAgentId, setResolvedAgentId] = useState<string | undefined>(undefined);

    useEffect(() => {
        const tid = (tenantFromUrl ?? '').trim();
        if (!tid) {
            setStatus('invalid');
            return;
        }
        setTenantId(tid);
        axios
            .get(`${API_BASE}/api/config`, { headers: { 'X-Tenant-Id': tid } })
            .then((res) => {
                const urlAgent = (agentFromUrl ?? '').trim();
                if (urlAgent) {
                    setResolvedAgentId(urlAgent);
                } else {
                    const entry = res.data?.entryAgentId;
                    setResolvedAgentId(entry && typeof entry === 'string' && entry.trim() ? entry.trim() : undefined);
                }
                setStatus('ok');
            })
            .catch((err) => {
                if (err?.response?.status === 404) setStatus('notfound');
                else setStatus('ok');
            });
    }, [tenantFromUrl, agentFromUrl, setTenantId]);

    if (status === 'invalid') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-[#f0f2f5] dark:bg-[#111b21] text-[#111b21] dark:text-[#e9edef] p-6">
                <p className="text-lg">Link inválido. Use o link fornecido pela empresa para testar o chat.</p>
            </div>
        );
    }

    if (status === 'notfound') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-[#f0f2f5] dark:bg-[#111b21] text-[#111b21] dark:text-[#e9edef] p-6">
                <p className="text-lg">Empresa não encontrada. Verifique se o link está correto.</p>
            </div>
        );
    }

    if (status === 'loading') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-[#f0f2f5] dark:bg-[#111b21] text-[#54656f] dark:text-[#aebac1]">
                <p>Carregando chat...</p>
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col bg-[#f0f2f5] dark:bg-[#111b21]">
            <ChatPage assistantId={resolvedAgentId} />
        </div>
    );
}
