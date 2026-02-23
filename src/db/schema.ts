import { pgTable, varchar, text, integer, timestamp, jsonb, real, bigint, index } from 'drizzle-orm/pg-core';

/**
 * Tabela principal de tenants.
 * Armazena a configuração completa (branding, api, prompt, features, assistants) como JSON blob.
 * Isso evita joins e migrações a cada novo campo de configuração.
 */
export const tenants = pgTable('tenants', {
    tenantId: varchar('tenant_id', { length: 64 }).primaryKey(),
    config: jsonb('config').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const executions = pgTable('executions', {
    id: varchar('id', { length: 128 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 64 }).notNull(),
    assistantId: varchar('assistant_id', { length: 64 }),
    phone: text('phone').notNull(),
    message: text('message').notNull(),
    reply: text('reply').notNull(),
    status: varchar('status', { length: 16 }).notNull(),
    durationMs: integer('duration_ms').notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    source: varchar('source', { length: 16 }).notNull(),
    debug: jsonb('debug'),
    model: text('model'),
    temperature: real('temperature'),
}, (t) => ({
    tenantTsIdx: index('executions_tenant_ts_idx').on(t.tenantId, t.timestamp),
    tenantPhoneIdx: index('executions_tenant_phone_idx').on(t.tenantId, t.phone),
}));

export const usageRecords = pgTable('usage_records', {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    tenantId: varchar('tenant_id', { length: 64 }).notNull(),
    assistantId: varchar('assistant_id', { length: 64 }),
    promptTokens: integer('prompt_tokens').notNull(),
    completionTokens: integer('completion_tokens').notNull(),
    totalTokens: integer('total_tokens').notNull(),
    model: text('model'),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    tenantAssistantTsIdx: index('usage_tenant_assistant_ts_idx').on(t.tenantId, t.assistantId, t.timestamp),
    tenantTsIdx: index('usage_tenant_ts_idx').on(t.tenantId, t.timestamp),
}));
