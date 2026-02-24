/**
 * Persistência de tenants.
 *
 * Estratégia por ambiente:
 *  - Local (desenvolvimento): lê/escreve em config/tenants/*.json
 *  - Vercel (produção): filesystem é read-only; usa /tmp como cache de invocação
 *    e Postgres (POSTGRES_URL) como storage persistente.
 *
 * Fluxo de escrita: /tmp  →  Postgres (async, quando disponível)
 * Fluxo de leitura: cache in-memory  →  /tmp  →  cwd (git)  →  Postgres (seed /tmp)
 */
import path from 'path';
import fs from 'fs';
import { getConfig, mergeWithDefaults, __resetConfigCache, TenantNotFoundError } from '../config/tenant';
import { deleteTenantConfig, getTenantConfigFromDb, listTenantIdsFromDb, upsertTenantConfig } from '../db/repositories/tenantRepository';

const CONFIG_DIR = 'config';
const TENANTS_DIR = path.join(CONFIG_DIR, 'tenants');
const DEFAULT_FILE = path.join(CONFIG_DIR, 'tenant.json');

const IS_VERCEL = !!(process.env.VERCEL);

/** Base gravável: /tmp no Vercel (read-only deployment dir), cwd em dev. */
function writableBase(): string {
    return IS_VERCEL ? '/tmp' : process.cwd();
}

function tenantsDir(base: string): string {
    return path.join(base, TENANTS_DIR);
}

function tenantFilePath(base: string, id: string): string {
    return path.join(base, TENANTS_DIR, `${id}.json`);
}

function defaultFilePath(base: string): string {
    return path.join(base, DEFAULT_FILE);
}

/**
 * Resolve o path de leitura de um tenant.
 * Ordem: /tmp (writes recentes) → cwd (arquivos comitados no git).
 */
function readFilePath(id: string): string | null {
    const cwd = process.cwd();
    const wb = writableBase();
    const candidates: string[] = [];

    if (wb !== cwd) {
        // Em Vercel: verifica /tmp primeiro
        candidates.push(id === 'default' ? defaultFilePath(wb) : tenantFilePath(wb, id));
    }
    candidates.push(id === 'default' ? defaultFilePath(cwd) : tenantFilePath(cwd, id));

    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

/** Valida id: apenas alfanuméricos, hífen e underscore. */
function isValidId(id: string): boolean {
    return /^[a-z0-9_-]+$/i.test(id) && id.length > 0 && id.length <= 64;
}

function collectIdsFromDir(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    try {
        return fs.readdirSync(dir)
            .filter((f) => f.endsWith('.json'))
            .map((f) => f.slice(0, -5))
            .filter(isValidId);
    } catch {
        return [];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// LEITURA SÍNCRONA (filesystem)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lista IDs de tenants a partir do filesystem (cwd + /tmp).
 * Para incluir tenants do Postgres use listAllTenantIds().
 */
export function listTenantIds(): string[] {
    const cwd = process.cwd();
    const wb = writableBase();
    const seen = new Set<string>();
    const ids: string[] = [];

    const defaultPaths = wb !== cwd
        ? [defaultFilePath(wb), defaultFilePath(cwd)]
        : [defaultFilePath(cwd)];
    if (defaultPaths.some((p) => fs.existsSync(p)) && !seen.has('default')) {
        seen.add('default');
        ids.push('default');
    }

    const dirs = wb !== cwd ? [tenantsDir(wb), tenantsDir(cwd)] : [tenantsDir(cwd)];
    for (const dir of dirs) {
        for (const id of collectIdsFromDir(dir)) {
            if (!seen.has(id)) {
                seen.add(id);
                ids.push(id);
            }
        }
    }

    return ids.sort((a, b) => (a === 'default' ? -1 : b === 'default' ? 1 : a.localeCompare(b)));
}

/** Retorna a configuração do tenant (após merge e env). Lança TenantNotFoundError se não existir. */
export function getTenantConfig(tenantId: string) {
    return getConfig(tenantId);
}

/**
 * Lê o tenant do arquivo e retorna config mesclada com defaults, sem env overrides.
 * Usado no PATCH para fazer merge com o body sem gravar env no arquivo.
 */
export function getTenantRaw(tenantId: string): Record<string, unknown> {
    const id = (tenantId || '').trim() || 'default';
    const filePath = readFilePath(id);
    if (!filePath) throw new TenantNotFoundError(id);
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
    const merged = mergeWithDefaults(raw);
    return {
        branding: merged.branding,
        api: merged.api,
        prompt: merged.prompt,
        features: merged.features,
        ...(merged.assistants && merged.assistants.length > 0 ? { assistants: merged.assistants } : {}),
        ...(merged.tools && merged.tools.length > 0 ? { tools: merged.tools } : {}),
        ...(merged.chatFlow ? { chatFlow: merged.chatFlow } : {}),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// LEITURA/ESCRITA ASSÍNCRONA (Postgres + filesystem)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Garante que o tenant esteja disponível no filesystem (/tmp ou cwd).
 * Se não existir no filesystem, carrega do Postgres e escreve no /tmp.
 * Deve ser chamada ANTES de qualquer operação síncrona sobre o tenant.
 */
export async function ensureTenantLoaded(tenantId: string): Promise<void> {
    const id = (tenantId || '').trim() || 'default';
    if (readFilePath(id)) return;  // Já existe no filesystem, ok

    // #region agent log
    fetch('http://127.0.0.1:7520/ingest/e566106f-4ab4-40ab-8bfd-c703d470cd11',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'436ca8'},body:JSON.stringify({sessionId:'436ca8',location:'tenantStorage.ts:ensureTenantLoaded',message:'não encontrado no FS, buscando no Postgres',data:{id,isDbEnabled:!!(process.env.POSTGRES_URL)},timestamp:Date.now(),hypothesisId:'DB-B'})}).catch(()=>{});
    // #endregion
    const raw = await getTenantConfigFromDb(id);
    if (!raw) {
        // #region agent log
        fetch('http://127.0.0.1:7520/ingest/e566106f-4ab4-40ab-8bfd-c703d470cd11',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'436ca8'},body:JSON.stringify({sessionId:'436ca8',location:'tenantStorage.ts:ensureTenantLoaded',message:'não encontrado no Postgres também',data:{id},timestamp:Date.now(),hypothesisId:'DB-B'})}).catch(()=>{});
        // #endregion
        return;  // Não existe no DB também
    }
    // #region agent log
    fetch('http://127.0.0.1:7520/ingest/e566106f-4ab4-40ab-8bfd-c703d470cd11',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'436ca8'},body:JSON.stringify({sessionId:'436ca8',location:'tenantStorage.ts:ensureTenantLoaded',message:'encontrado no Postgres, semeando /tmp',data:{id},timestamp:Date.now(),hypothesisId:'DB-B'})}).catch(()=>{});
    // #endregion

    // Escreve no /tmp para que getConfig() possa ler sincronamente
    const wb = writableBase();
    const dir = id === 'default' ? path.join(wb, CONFIG_DIR) : tenantsDir(wb);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = id === 'default' ? defaultFilePath(wb) : tenantFilePath(wb, id);
    fs.writeFileSync(filePath, JSON.stringify(raw, null, 2), 'utf8');
    __resetConfigCache();
    console.log(`[tenantStorage] Tenant "${id}" carregado do Postgres → ${filePath}`);
}

/**
 * Lista todos os IDs de tenants (filesystem + Postgres, sem duplicatas).
 */
export async function listAllTenantIds(): Promise<string[]> {
    const fsIds = listTenantIds();
    const dbIds = await listTenantIdsFromDb();
    const all = new Set([...fsIds, ...dbIds]);
    return [...all].sort((a, b) => (a === 'default' ? -1 : b === 'default' ? 1 : a.localeCompare(b)));
}

// ─────────────────────────────────────────────────────────────────────────────
// ESCRITA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cria ou atualiza um tenant.
 * Escreve no filesystem (/tmp em Vercel) E no Postgres (quando disponível).
 * No Vercel, o Postgres é o storage persistente entre invocações.
 */
export async function writeTenant(tenantId: string, payload: Record<string, unknown>): Promise<void> {
    const id = (tenantId || '').trim() || 'default';
    if (!isValidId(id)) {
        throw new Error('ID do tenant inválido: use apenas letras, números, hífen e underscore (até 64 caracteres).');
    }
    const merged = mergeWithDefaults(payload);
    const wb = writableBase();

    // 1. Escreve no filesystem (cache local / dev)
    const dir = id === 'default' ? path.join(wb, CONFIG_DIR) : tenantsDir(wb);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = id === 'default' ? defaultFilePath(wb) : tenantFilePath(wb, id);
    const toWrite = {
        branding: merged.branding,
        api: merged.api,
        prompt: merged.prompt,
        features: merged.features,
        ...(merged.assistants && merged.assistants.length > 0 ? { assistants: merged.assistants } : {}),
        ...(merged.tools && merged.tools.length > 0 ? { tools: merged.tools } : {}),
        ...(merged.chatFlow ? { chatFlow: merged.chatFlow } : {}),
    };
    fs.writeFileSync(filePath, JSON.stringify(toWrite, null, 2), 'utf8');

    // 2. Persiste no Postgres (storage duradouro em produção)
    // #region agent log
    fetch('http://127.0.0.1:7520/ingest/e566106f-4ab4-40ab-8bfd-c703d470cd11',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'436ca8'},body:JSON.stringify({sessionId:'436ca8',location:'tenantStorage.ts:writeTenant',message:'antes upsertTenantConfig',data:{id,isDbEnabled:!!(process.env.POSTGRES_URL),VERCEL:process.env.VERCEL,filePath,fsWriteOk:true},timestamp:Date.now(),hypothesisId:'DB-A'})}).catch(()=>{});
    // #endregion
    try {
        await upsertTenantConfig(id, toWrite);
        // #region agent log
        fetch('http://127.0.0.1:7520/ingest/e566106f-4ab4-40ab-8bfd-c703d470cd11',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'436ca8'},body:JSON.stringify({sessionId:'436ca8',location:'tenantStorage.ts:writeTenant',message:'upsertTenantConfig SUCCESS',data:{id},timestamp:Date.now(),hypothesisId:'DB-A'})}).catch(()=>{});
        // #endregion
    } catch (dbErr: any) {
        // #region agent log
        fetch('http://127.0.0.1:7520/ingest/e566106f-4ab4-40ab-8bfd-c703d470cd11',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'436ca8'},body:JSON.stringify({sessionId:'436ca8',location:'tenantStorage.ts:writeTenant',message:'upsertTenantConfig FAILED',data:{id,error:dbErr.message},timestamp:Date.now(),hypothesisId:'DB-A'})}).catch(()=>{});
        // #endregion
        console.warn('[tenantStorage] Falha ao salvar tenant no Postgres:', dbErr.message);
        // Não relança — o write no filesystem foi bem-sucedido
    }

    __resetConfigCache();
}

/**
 * Remove o tenant do filesystem e do Postgres.
 */
export async function deleteTenant(tenantId: string): Promise<void> {
    const id = (tenantId || '').trim();
    if (!id) throw new Error('ID do tenant é obrigatório.');

    const filePath = readFilePath(id);
    if (!filePath) {
        // Verifica se existe no Postgres antes de lançar erro
        const dbConfig = await getTenantConfigFromDb(id);
        if (!dbConfig) throw new TenantNotFoundError(id);
    }

    if (filePath) {
        try { fs.unlinkSync(filePath); } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
    }

    // Remove também do /tmp se estiver lá
    const wb = writableBase();
    const tmpPath = id === 'default' ? defaultFilePath(wb) : tenantFilePath(wb, id);
    if (tmpPath !== filePath && fs.existsSync(tmpPath)) {
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    }

    try {
        await deleteTenantConfig(id);
    } catch (dbErr: any) {
        console.warn('[tenantStorage] Falha ao remover tenant do Postgres:', dbErr.message);
    }

    __resetConfigCache();
}
