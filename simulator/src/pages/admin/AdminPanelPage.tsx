import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Plus, Building2, ChevronRight } from 'lucide-react';
import { getAdminHeaders, ADMIN_KEY_STORAGE } from './AdminKeyPage';

const QUALY_API_PORT = import.meta.env.VITE_API_PORT || '3001';
const ADMIN_API_BASE = import.meta.env.VITE_CHAT_API_URL || `http://localhost:${QUALY_API_PORT}`;

type TenantsResponse = { tenants: string[] };

type Props = { basePath?: string };

export default function AdminPanelPage({ basePath = '/admin' }: Props) {
    const [tenants, setTenants] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        axios
            .get<TenantsResponse>(`${ADMIN_API_BASE}/api/admin/tenants`, { headers: getAdminHeaders() })
            .then((res) => {
                setTenants(res.data.tenants || []);
                setError(null);
            })
            .catch((err) => {
                if (err?.response?.status === 401) {
                    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
                    navigate(basePath, { replace: true });
                    return;
                }
                setError(err?.response?.data?.error || 'Erro ao carregar empresas.');
            })
            .finally(() => setLoading(false));
    }, [navigate]);

    if (loading) {
        return (
            <div className="py-8">
                <p className="text-[#54656f] dark:text-[#aebac1]">Carregando empresas…</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="py-8">
                <p className="text-red-500">{error}</p>
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="mt-2 text-sm text-[#00a884] hover:underline"
                >
                    Tentar novamente
                </button>
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-[#111b21] dark:text-[#e9edef]">Empresas</h2>
                <span className="text-sm text-[#54656f] dark:text-[#aebac1]">
                    {tenants.length} {tenants.length === 1 ? 'empresa' : 'empresas'}
                </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {tenants.map((id) => (
                    <Link
                        key={id}
                        to={`${basePath}/${encodeURIComponent(id)}`}
                        className="group flex flex-col rounded-xl border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#202c33] p-5 shadow-sm hover:shadow-md hover:border-[#00a884]/40 dark:hover:border-[#00a884]/50 transition-all duration-200"
                    >
                        <div className="flex items-start gap-4">
                            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-[#00a884]/10 dark:bg-[#00a884]/20 flex items-center justify-center">
                                <Building2 size={24} className="text-[#00a884]" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h3 className="font-semibold text-[#111b21] dark:text-[#e9edef] truncate group-hover:text-[#00a884] transition-colors">
                                    {id}
                                </h3>
                                <p className="text-xs text-[#54656f] dark:text-[#8696a0] mt-0.5">Tenant / Empresa</p>
                            </div>
                            <ChevronRight size={20} className="flex-shrink-0 text-[#8696a0] group-hover:text-[#00a884] group-hover:translate-x-0.5 transition-all" />
                        </div>
                        <div className="mt-4 pt-4 border-t border-[#e9edef] dark:border-[#2a3942]">
                            <span className="text-sm font-medium text-[#00a884] group-hover:underline">
                                Ver agentes
                            </span>
                        </div>
                    </Link>
                ))}

                <Link
                    to={`${basePath}/new`}
                    className="flex flex-col items-center justify-center min-h-[140px] rounded-xl border-2 border-dashed border-[#00a884] bg-[#00a884]/5 dark:bg-[#00a884]/10 text-[#00a884] hover:bg-[#00a884]/10 dark:hover:bg-[#00a884]/20 hover:border-[#00a884] transition-all duration-200"
                >
                    <div className="w-12 h-12 rounded-xl border-2 border-dashed border-[#00a884] flex items-center justify-center mb-3">
                        <Plus size={24} />
                    </div>
                    <span className="font-medium">Nova empresa</span>
                    <span className="text-xs mt-1 opacity-90">Cadastrar tenant</span>
                </Link>
            </div>

            {tenants.length === 0 && (
                <p className="mt-4 text-[#54656f] dark:text-[#aebac1] text-sm">Nenhuma empresa cadastrada. Use o card acima para criar a primeira.</p>
            )}
        </div>
    );
}
