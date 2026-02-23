-- Migração inicial: schema simplificado para Vercel Serverless
-- Tenants armazena toda a config (incluindo agentes) como um JSON blob.
-- Isso evita joins e migração a cada novo campo.

CREATE TABLE IF NOT EXISTS "tenants" (
	"tenant_id" varchar(64) PRIMARY KEY NOT NULL,
	"config" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "executions" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"assistant_id" varchar(64),
	"phone" text NOT NULL,
	"message" text NOT NULL,
	"reply" text NOT NULL,
	"status" varchar(16) NOT NULL,
	"duration_ms" integer NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"source" varchar(16) NOT NULL,
	"debug" jsonb,
	"model" text,
	"temperature" real
);
CREATE INDEX IF NOT EXISTS "executions_tenant_ts_idx" ON "executions" USING btree ("tenant_id","timestamp");
CREATE INDEX IF NOT EXISTS "executions_tenant_phone_idx" ON "executions" USING btree ("tenant_id","phone");

CREATE TABLE IF NOT EXISTS "usage_records" (
	"id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"assistant_id" varchar(64),
	"prompt_tokens" integer NOT NULL,
	"completion_tokens" integer NOT NULL,
	"total_tokens" integer NOT NULL,
	"model" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "usage_tenant_assistant_ts_idx" ON "usage_records" USING btree ("tenant_id","assistant_id","timestamp");
CREATE INDEX IF NOT EXISTS "usage_tenant_ts_idx" ON "usage_records" USING btree ("tenant_id","timestamp");
