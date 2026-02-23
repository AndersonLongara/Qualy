import { eq } from 'drizzle-orm';
import { getDb, isDbEnabled, ensureMigrations } from '../client';
import { tenants } from '../schema';

/**
 * Salva (cria ou atualiza) a configuração completa de um tenant como JSON blob.
 */
export async function upsertTenantConfig(tenantId: string, config: Record<string, unknown>): Promise<void> {
    if (!isDbEnabled()) return;
    await ensureMigrations();
    const db = getDb();
    await db
        .insert(tenants)
        .values({ tenantId, config, updatedAt: new Date() })
        .onConflictDoUpdate({
            target: tenants.tenantId,
            set: { config, updatedAt: new Date() },
        });
}

/**
 * Retorna a configuração completa do tenant ou null se não existir.
 */
export async function getTenantConfigFromDb(tenantId: string): Promise<Record<string, unknown> | null> {
    if (!isDbEnabled()) return null;
    await ensureMigrations();
    const db = getDb();
    const rows = await db.select().from(tenants).where(eq(tenants.tenantId, tenantId)).limit(1);
    if (rows.length === 0) return null;
    return rows[0].config as Record<string, unknown>;
}

/**
 * Remove o tenant do banco.
 */
export async function deleteTenantConfig(tenantId: string): Promise<void> {
    if (!isDbEnabled()) return;
    const db = getDb();
    await db.delete(tenants).where(eq(tenants.tenantId, tenantId));
}

/**
 * Lista todos os IDs de tenants no banco.
 */
export async function listTenantIdsFromDb(): Promise<string[]> {
    // #region agent log
    fetch('http://127.0.0.1:7520/ingest/e566106f-4ab4-40ab-8bfd-c703d470cd11',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f4e980'},body:JSON.stringify({sessionId:'f4e980',location:'tenantRepository.ts:listTenantIdsFromDb',message:'entry',data:{isDbEnabled:isDbEnabled()},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    if (!isDbEnabled()) return [];
    try {
        // #region agent log
        fetch('http://127.0.0.1:7520/ingest/e566106f-4ab4-40ab-8bfd-c703d470cd11',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f4e980'},body:JSON.stringify({sessionId:'f4e980',location:'tenantRepository.ts:listTenantIdsFromDb',message:'before ensureMigrations',data:{},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
        // #endregion
        await ensureMigrations();
        // #region agent log
        fetch('http://127.0.0.1:7520/ingest/e566106f-4ab4-40ab-8bfd-c703d470cd11',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f4e980'},body:JSON.stringify({sessionId:'f4e980',location:'tenantRepository.ts:listTenantIdsFromDb',message:'after ensureMigrations, before select',data:{},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
        // #endregion
        const db = getDb();
        const rows = await db.select({ tenantId: tenants.tenantId }).from(tenants);
        // #region agent log
        fetch('http://127.0.0.1:7520/ingest/e566106f-4ab4-40ab-8bfd-c703d470cd11',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f4e980'},body:JSON.stringify({sessionId:'f4e980',location:'tenantRepository.ts:listTenantIdsFromDb',message:'select success',data:{rowCount:rows.length},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
        // #endregion
        return rows
            .map((r) => r.tenantId)
            .sort((a, b) => (a === 'default' ? -1 : b === 'default' ? 1 : a.localeCompare(b)));
    } catch (err: any) {
        // #region agent log
        fetch('http://127.0.0.1:7520/ingest/e566106f-4ab4-40ab-8bfd-c703d470cd11',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f4e980'},body:JSON.stringify({sessionId:'f4e980',location:'tenantRepository.ts:listTenantIdsFromDb',message:'catch',data:{errorMessage:err?.message,errorName:err?.name,code:err?.code},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
        // #endregion
        throw err;
    }
}
