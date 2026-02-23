#!/usr/bin/env node
/**
 * Bootstrap não-interativo para Vercel + stores.
 *
 * Observação:
 * - A CLI atual (50.x) usa Marketplace Integrations para Postgres/KV.
 * - Este script tenta instalar integrações (se ausentes), linkar projeto e puxar envs.
 * - Requer VERCEL_TOKEN e, opcionalmente, VERCEL_SCOPE / VERCEL_PROJECT_NAME.
 */
const { spawnSync } = require('child_process');

const token = process.env.VERCEL_TOKEN;
if (!token) {
    console.error('ERRO: defina VERCEL_TOKEN para rodar o bootstrap.');
    process.exit(1);
}

const projectName = process.env.VERCEL_PROJECT_NAME || 'qualy-altraia';
const scope = process.env.VERCEL_SCOPE;
const postgresIntegration = process.env.VERCEL_POSTGRES_INTEGRATION || 'vercel-postgres';
const kvIntegration = process.env.VERCEL_KV_INTEGRATION || 'upstash';

function run(args, opts = {}) {
    const base = ['--token', token];
    if (scope) base.push('--scope', scope);
    const cmd = ['vercel', ...args, ...base];
    console.log(`> npx ${cmd.join(' ')}`);
    const result = spawnSync('npx', cmd, {
        stdio: 'inherit',
        shell: true,
        env: process.env,
        ...opts,
    });
    if (result.status !== 0 && !opts.allowFailure) {
        process.exit(result.status || 1);
    }
    return result.status || 0;
}

// 1) link local -> projeto
run(['link', '--yes', '--project', projectName]);

// 2) tenta instalar integrações de storage
run(['integration', 'add', postgresIntegration], { allowFailure: true });
run(['integration', 'add', kvIntegration], { allowFailure: true });

// 3) puxa variáveis para arquivo local (útil em CI para validar anexos)
run(['env', 'pull', '.env.vercel', '--yes'], { allowFailure: true });

console.log('Bootstrap concluído.');
console.log('Se integrações ainda exigirem confirmação no dashboard, finalize uma vez e rode este script novamente.');
