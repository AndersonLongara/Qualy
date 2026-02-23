/**
 * Layout do painel admin: exige token (login) primeiro; depois mostra abas Empresas e Consumo.
 */
import { useNavigate, NavLink, Routes, Route, Navigate } from 'react-router-dom';
import { LogOut, Building2, BarChart3 } from 'lucide-react';
import { ADMIN_KEY_STORAGE } from './AdminKeyPage';
import ThemeToggle from '../../components/ThemeToggle';
import AdminKeyPage from './AdminKeyPage';
import AdminPanelPage from './AdminPanelPage';
import AdminTenantDetailPage from './AdminTenantDetailPage';
import AdminUsagePage from './AdminUsagePage';

function cn(...classes: (string | undefined | false)[]) {
    return classes.filter(Boolean).join(' ');
}

export default function AdminLayout() {
    const key = sessionStorage.getItem(ADMIN_KEY_STORAGE);
    const navigate = useNavigate();

    const handleLogout = () => {
        sessionStorage.removeItem(ADMIN_KEY_STORAGE);
        navigate('/admin', { replace: true });
    };

    if (!key) {
        return <AdminKeyPage />;
    }

    return (
        <div className="flex flex-col h-full min-h-0 bg-[#f0f2f5] dark:bg-[#111b21]">
            <header className="flex items-center gap-6 px-4 py-3 border-b border-[#e9edef] dark:border-[#202c33] bg-white dark:bg-[#202c33] shrink-0">
                <span className="font-semibold text-[#00a884]">Painel Admin</span>
                <nav className="flex gap-1">
                    <NavLink
                        to="/admin/tenants"
                        end={false}
                        className={({ isActive }) =>
                            cn(
                                'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                                isActive
                                    ? 'bg-[#00a884]/10 text-[#00a884]'
                                    : 'text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5'
                            )
                        }
                    >
                        <Building2 size={18} />
                        Empresas
                    </NavLink>
                    <NavLink
                        to="/admin/usage"
                        className={({ isActive }) =>
                            cn(
                                'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                                isActive
                                    ? 'bg-[#00a884]/10 text-[#00a884]'
                                    : 'text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5'
                            )
                        }
                    >
                        <BarChart3 size={18} />
                        Consumo
                    </NavLink>
                </nav>
                <div className="ml-auto flex items-center gap-1">
                    <ThemeToggle />
                    <button
                        type="button"
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-[#54656f] dark:text-[#aebac1] hover:text-[#00a884] hover:bg-black/5 dark:hover:bg-white/5"
                    >
                        <LogOut size={18} /> Sair
                    </button>
                </div>
            </header>
            <main className="flex-1 overflow-auto min-h-0 min-w-0 bg-[#f0f2f5] dark:bg-[#111b21]">
                <div className="w-full max-w-4xl mx-auto px-6 py-6">
                    <Routes>
                        <Route path="/admin/tenants/:id" element={<AdminTenantDetailPage />} />
                        <Route path="/admin/tenants" element={<AdminPanelPage />} />
                        <Route path="/admin/usage" element={<AdminUsagePage />} />
                        <Route path="/admin" element={<Navigate to="/admin/tenants" replace />} />
                    </Routes>
                </div>
            </main>
        </div>
    );
}
