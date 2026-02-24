/**
 * Layout Empresas: exige token (login). Rotas: lista de empresas, nova empresa, detalhe empresa, detalhe agente.
 */
import { useNavigate, NavLink, Routes, Route } from 'react-router-dom';
import { LogOut, Building2 } from 'lucide-react';
import { ADMIN_KEY_STORAGE } from '../admin/AdminKeyPage';
import ThemeToggle from '../../components/ThemeToggle';
import AdminKeyPage from '../admin/AdminKeyPage';
import AdminPanelPage from '../admin/AdminPanelPage';
import AdminTenantDetailPage from '../admin/AdminTenantDetailPage';
import CompanyAgentsPage from './CompanyAgentsPage';
import NewAgentPage from './NewAgentPage';
import AgentDetailPage from './AgentDetailPage';
import TenantToolsPage from './TenantToolsPage';
import ConversationTimelinePage from './ConversationTimelinePage';
import ExecutionDetailPage from '../ExecutionDetailPage';
import GeneralChatPreviewPage from './GeneralChatPreviewPage';

export default function EmpresasLayout() {
    const key = sessionStorage.getItem(ADMIN_KEY_STORAGE);
    const navigate = useNavigate();

    const handleLogout = () => {
        sessionStorage.removeItem(ADMIN_KEY_STORAGE);
        navigate('/empresas', { replace: true });
    };

    if (!key) {
        return <AdminKeyPage />;
    }

    return (
        <div className="flex flex-col h-full min-h-0 bg-[#f0f2f5] dark:bg-[#111b21]">
            <header className="flex items-center gap-6 px-4 py-3 border-b border-[#e9edef] dark:border-[#202c33] bg-white dark:bg-[#202c33] shrink-0">
                <NavLink to="/empresas" className="font-semibold text-[#00a884] flex items-center gap-2">
                    <Building2 size={20} />
                    AltraIA
                </NavLink>
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
                <div className="w-full max-w-7xl mx-auto px-4 py-4">
                    <Routes>
                        <Route path="agentes/:companyId/:agentId" element={<AgentDetailPage />} />
                        <Route path=":companyId/preview" element={<GeneralChatPreviewPage />} />
                        <Route path="execucoes/:id" element={<ExecutionDetailPage />} />
                        <Route path=":companyId/agentes/new" element={<NewAgentPage />} />
                        <Route path="new" element={<AdminTenantDetailPage basePath="/empresas" />} />
                        <Route path=":id/editar" element={<AdminTenantDetailPage basePath="/empresas" />} />
                        <Route path=":id/tools" element={<TenantToolsPage />} />
                        <Route path=":id/conversas" element={<ConversationTimelinePage />} />
                        <Route path=":id" element={<CompanyAgentsPage />} />
                        <Route index element={<AdminPanelPage basePath="/empresas" />} />
                    </Routes>
                </div>
            </main>
        </div>
    );
}
