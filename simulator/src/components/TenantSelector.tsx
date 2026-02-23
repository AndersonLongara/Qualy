import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useTenant } from '../context/TenantContext';

export default function TenantSelector() {
    const { tenantId, setTenantId, tenants, loading, error, refetchTenants } = useTenant();

    return (
        <div className="flex items-center gap-2">
            <span className="text-xs text-[#54656f] dark:text-[#aebac1] hidden sm:inline">Empresa:</span>
            <select
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                disabled={loading}
                className="rounded-md border border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#2a3942] text-[#111b21] dark:text-[#e9edef] text-sm px-2 py-1.5 min-w-[140px] disabled:opacity-60 disabled:cursor-not-allowed"
                title="Selecione a empresa"
            >
                {loading ? (
                    <option value="default">Carregando…</option>
                ) : (
                    tenants.map((t) => (
                        <option key={t.id} value={t.id}>
                            {t.companyName ?? t.id}
                        </option>
                    ))
                )}
            </select>
            <Link
                to="/empresas/new"
                className="flex items-center gap-1 text-xs text-[#00a884] hover:underline whitespace-nowrap font-medium"
                title="Criar nova empresa"
            >
                <Plus size={14} />
                Nova empresa
            </Link>
            {error && (
                <button
                    type="button"
                    onClick={() => refetchTenants()}
                    className="text-xs text-[#00a884] hover:underline whitespace-nowrap"
                    title={error}
                >
                    Tentar novamente
                </button>
            )}
        </div>
    );
}
