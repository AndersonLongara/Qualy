import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

let sqlClient: ReturnType<typeof postgres> | null = null;
let dbClient: ReturnType<typeof drizzle<typeof schema>> | null = null;
let migrationsDone = false;

export function isDbEnabled(): boolean {
    return !!(process.env.POSTGRES_URL && process.env.POSTGRES_URL.trim());
}

export function getDb() {
    if (!isDbEnabled()) {
        throw new Error('POSTGRES_URL não configurada.');
    }
    if (!sqlClient) {
        sqlClient = postgres(process.env.POSTGRES_URL as string, {
            max: 5,
            idle_timeout: 20,
            connect_timeout: 10,
        });
        dbClient = drizzle(sqlClient, { schema });
    }
    return dbClient!;
}

/**
 * Executa as migrations inline (sem depender de arquivos .sql no disco).
 * Usa CREATE TABLE IF NOT EXISTS — idempotente, seguro para serverless.
 */
export async function ensureMigrations(): Promise<void> {
    if (migrationsDone || !isDbEnabled()) return;

    // #region agent log
    fetch('http://127.0.0.1:7520/ingest/e566106f-4ab4-40ab-8bfd-c703d470cd11', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '436ca8' }, body: JSON.stringify({ sessionId: '436ca8', location: 'client.ts:ensureMigrations', message: 'iniciando migrations inline', data: { POSTGRES_URL_SET: !!(process.env.POSTGRES_URL) }, timestamp: Date.now(), hypothesisId: 'MIG-A' }) }).catch(() => {});
    // #endregion

    try {
        const sql = sqlClient ?? (() => {
            sqlClient = postgres(process.env.POSTGRES_URL as string, { max: 5, idle_timeout: 20, connect_timeout: 10 });
            dbClient = drizzle(sqlClient, { schema });
            return sqlClient;
        })();

        await sql`
            CREATE TABLE IF NOT EXISTS "tenants" (
                "tenant_id" VARCHAR(64) PRIMARY KEY NOT NULL,
                "config" JSONB NOT NULL,
                "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS "executions" (
                "id" VARCHAR(128) PRIMARY KEY NOT NULL,
                "tenant_id" VARCHAR(64) NOT NULL,
                "assistant_id" VARCHAR(64),
                "phone" TEXT NOT NULL,
                "message" TEXT NOT NULL,
                "reply" TEXT NOT NULL,
                "status" VARCHAR(16) NOT NULL,
                "duration_ms" INTEGER NOT NULL,
                "timestamp" TIMESTAMPTZ NOT NULL,
                "source" VARCHAR(16) NOT NULL,
                "debug" JSONB,
                "model" TEXT,
                "temperature" REAL
            )
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS "executions_tenant_ts_idx"
            ON "executions" ("tenant_id", "timestamp")
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS "executions_tenant_phone_idx"
            ON "executions" ("tenant_id", "phone")
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS "usage_records" (
                "id" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
                "tenant_id" VARCHAR(64) NOT NULL,
                "assistant_id" VARCHAR(64),
                "prompt_tokens" INTEGER NOT NULL,
                "completion_tokens" INTEGER NOT NULL,
                "total_tokens" INTEGER NOT NULL,
                "model" TEXT,
                "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS "usage_tenant_assistant_ts_idx"
            ON "usage_records" ("tenant_id", "assistant_id", "timestamp")
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS "usage_tenant_ts_idx"
            ON "usage_records" ("tenant_id", "timestamp")
        `;

        migrationsDone = true;

        // #region agent log
        fetch('http://127.0.0.1:7520/ingest/e566106f-4ab4-40ab-8bfd-c703d470cd11', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '436ca8' }, body: JSON.stringify({ sessionId: '436ca8', location: 'client.ts:ensureMigrations', message: 'migrations inline SUCESSO', data: {}, timestamp: Date.now(), hypothesisId: 'MIG-A' }) }).catch(() => {});
        // #endregion

        console.log('[db] Migrations aplicadas com sucesso (inline).');
    } catch (err: any) {
        // #region agent log
        fetch('http://127.0.0.1:7520/ingest/e566106f-4ab4-40ab-8bfd-c703d470cd11', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '436ca8' }, body: JSON.stringify({ sessionId: '436ca8', location: 'client.ts:ensureMigrations', message: 'migrations inline FALHOU', data: { error: err.message }, timestamp: Date.now(), hypothesisId: 'MIG-A' }) }).catch(() => {});
        // #endregion
        console.warn('[db] Aviso ao aplicar migrations:', err.message);
        migrationsDone = true; // Não tenta de novo em caso de erro inesperado
    }
}

export async function closeDb(): Promise<void> {
    if (sqlClient) {
        await sqlClient.end({ timeout: 5 });
        sqlClient = null;
        dbClient = null;
        migrationsDone = false;
    }
}
