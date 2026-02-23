import { Routes, Route, Navigate } from 'react-router-dom';
import { TenantProvider } from './context/TenantContext';
import PublicChatPage from './pages/PublicChatPage';
import EmpresasLayout from './pages/empresas/EmpresasLayout';

function App() {
    return (
        <TenantProvider>
            <div className="flex flex-col h-screen bg-[#f0f2f5] dark:bg-[#111b21] text-[#111b21] dark:text-[#e9edef]">
                <main className="flex-1 overflow-hidden min-h-0">
                    <Routes>
                        <Route path="/t/:tenantId" element={<PublicChatPage />} />
                        <Route path="/" element={<Navigate to="/empresas" replace />} />
                        <Route path="/empresas/*" element={<EmpresasLayout />} />
                    </Routes>
                </main>
            </div>
        </TenantProvider>
    );
}

export default App;
