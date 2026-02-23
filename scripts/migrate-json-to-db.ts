import fs from 'fs';
import path from 'path';
import { mergeWithDefaults, type TenantConfig } from '../src/config/tenant';
import { upsertTenantConfig } from '../src/db/repositories/tenantRepository';

function readTenantFile(filePath: string): TenantConfig | null {
    try {
        if (!fs.existsSync(filePath)) return null;
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
        return mergeWithDefaults(raw);
    } catch (err) {
        console.warn('[migrate-json-to-db] Falha ao ler', filePath, (err as Error).message);
        return null;
    }
}

async function main() {
    if (!process.env.POSTGRES_URL) {
        console.log('POSTGRES_URL não configurada. Migração JSON->DB ignorada.');
        return;
    }

    const cwd = process.cwd();
    const configDir = path.join(cwd, 'config');
    const defaultPath = path.join(configDir, 'tenant.json');
    const tenantsDir = path.join(configDir, 'tenants');

    const payloads: Array<{ id: string; config: TenantConfig }> = [];
    const defaultCfg = readTenantFile(defaultPath);
    if (defaultCfg) payloads.push({ id: 'default', config: defaultCfg });

    if (fs.existsSync(tenantsDir)) {
        const files = fs.readdirSync(tenantsDir).filter((f) => f.endsWith('.json'));
        for (const f of files) {
            const tenantId = f.slice(0, -5);
            const cfg = readTenantFile(path.join(tenantsDir, f));
            if (cfg) payloads.push({ id: tenantId, config: cfg });
        }
    }

    for (const p of payloads) {
        await upsertTenantConfig(p.id, p.config);
        console.log(`[migrate-json-to-db] Tenant migrado: ${p.id}`);
    }
    console.log(`[migrate-json-to-db] Concluído. ${payloads.length} tenant(s) processados.`);
}

main().catch((err) => {
    console.error('[migrate-json-to-db] Erro fatal:', err);
    process.exit(1);
});
