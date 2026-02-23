#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const postgres = require('postgres');

async function main() {
    const url = process.env.POSTGRES_URL;
    if (!url) {
        console.log('POSTGRES_URL não configurada. Pulando migrations.');
        return;
    }
    const sql = postgres(url, { max: 1 });
    try {
        await sql`create table if not exists _app_migrations (
            id serial primary key,
            name text not null unique,
            applied_at timestamptz not null default now()
        )`;

        const dir = path.join(process.cwd(), 'drizzle');
        if (!fs.existsSync(dir)) return;
        const files = fs
            .readdirSync(dir)
            .filter((f) => f.endsWith('.sql'))
            .sort((a, b) => a.localeCompare(b));

        for (const file of files) {
            const already = await sql`select 1 from _app_migrations where name = ${file} limit 1`;
            if (already.length > 0) {
                console.log(`Migration já aplicada: ${file}`);
                continue;
            }
            const statement = fs.readFileSync(path.join(dir, file), 'utf8');
            console.log(`Aplicando migration: ${file}`);
            await sql.begin(async (tx) => {
                await tx.unsafe(statement);
                await tx`insert into _app_migrations (name) values (${file})`;
            });
        }
    } finally {
        await sql.end({ timeout: 5 });
    }
}

main().catch((err) => {
    console.error('Erro ao aplicar migrations:', err);
    process.exit(1);
});
