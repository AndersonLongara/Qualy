import { Navigate, useLocation } from 'react-router-dom';
import AdminKeyPage from './AdminKeyPage';
import { ADMIN_KEY_STORAGE } from './AdminKeyPage';

/**
 * Na rota /admin: se não houver chave salva, mostra tela de chave; senão redireciona para o painel.
 */
export default function AdminGate() {
    const key = sessionStorage.getItem(ADMIN_KEY_STORAGE);
    const location = useLocation();
    if (key) {
        return <Navigate to="/admin/tenants" replace state={ { from: location.pathname } } />;
    }
    return <AdminKeyPage />;
}
