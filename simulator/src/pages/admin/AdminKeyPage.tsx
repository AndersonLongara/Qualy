import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import ThemeToggle from '../../components/ThemeToggle';

const QUALY_API_PORT = import.meta.env.VITE_API_PORT || '3001';
const ADMIN_API_BASE = import.meta.env.VITE_CHAT_API_URL || `http://localhost:${QUALY_API_PORT}`;
export const ADMIN_KEY_STORAGE = 'altraflow_admin_key';

export function getAdminHeaders(): Record<string, string> {
    const key = sessionStorage.getItem(ADMIN_KEY_STORAGE);
    return key ? { 'X-Admin-Key': key } : {};
}

export default function AdminKeyPage() {
    const [key, setKey] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const k = key.trim();
        if (!k) {
            setError('Informe a chave de administração.');
            return;
        }
        setError(null);
        setLoading(true);
        try {
            await axios.get(`${ADMIN_API_BASE}/api/admin/tenants`, {
                headers: { 'X-Admin-Key': k },
            });
            sessionStorage.setItem(ADMIN_KEY_STORAGE, k);
            navigate('/empresas', { replace: true });
        } catch (err: any) {
            const isNetworkError = err?.code === 'ERR_NETWORK' || !err?.response;
            const apiError = err?.response?.data?.error || '';
            const isExternalApiError = typeof apiError === 'string' && /SuperAdmin|required|permission/i.test(apiError);
            const msg = err?.response?.status === 401
                ? isExternalApiError
                    ? 'A requisição foi para outra API (ex.: SouChat). Certifique-se de que o backend AltraIA está rodando e use aqui exatamente o valor de ADMIN_API_KEY do .env.local do projeto.'
                    : 'Chave inválida ou administração desabilitada. Use o mesmo valor definido em ADMIN_API_KEY no .env.local do backend.'
                : isNetworkError
                    ? `Não foi possível conectar à API. Verifique se o servidor AltraIA está rodando (porta ${QUALY_API_PORT}) e se ADMIN_API_KEY está no .env.local do backend.`
                    : apiError || err?.message || 'Erro ao validar chave.';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-full flex items-center justify-center p-6 bg-[#f0f2f5] dark:bg-[#111b21] relative">
            <div className="absolute top-4 right-4">
                <ThemeToggle />
            </div>
            <div className="w-full max-w-sm rounded-xl border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#202c33] p-8 shadow-sm">
                <h1 className="text-xl font-semibold text-[#111b21] dark:text-[#e9edef] mb-1 text-center">Login</h1>
                <p className="text-sm text-[#54656f] dark:text-[#aebac1] mb-6 text-center">
                    Acesso ao painel admin. Informe o token de administração.
                </p>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="admin-key" className="block text-sm font-medium text-[#111b21] dark:text-[#e9edef] mb-1">
                            Token de administração
                        </label>
                        <input
                            id="admin-key"
                            type="password"
                            autoComplete="off"
                            value={key}
                            onChange={(e) => setKey(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-lg border border-[#e9edef] dark:border-[#2a3942] bg-[#f0f2f5] dark:bg-[#111b21] text-[#111b21] dark:text-[#e9edef] placeholder-[#8696a0] focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                            placeholder="Cole o token aqui"
                        />
                    </div>
                    {error && (
                        <p className="text-sm text-red-500" role="alert">{error}</p>
                    )}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-2.5 px-4 rounded-lg bg-[#00a884] hover:bg-[#008f72] text-white font-medium disabled:opacity-50 transition-colors"
                    >
                        {loading ? 'Entrando…' : 'Entrar'}
                    </button>
                </form>
            </div>
        </div>
    );
}
