#!/usr/bin/env node
/**
 * Deploy CI não-interativo:
 * 1) bootstrap Vercel/integrations
 * 2) migrate DB
 * 3) deploy --prod --yes
 */
const { spawnSync } = require('child_process');

function run(command, args) {
    console.log(`> ${command} ${args.join(' ')}`);
    const result = spawnSync(command, args, {
        stdio: 'inherit',
        shell: true,
        env: process.env,
    });
    if (result.status !== 0) {
        process.exit(result.status || 1);
    }
}

run('node', ['scripts/vercel-bootstrap-storage.js']);
run('npm', ['run', 'db:migrate']);
run('npx', ['vercel', '--prod', '--yes', '--token', process.env.VERCEL_TOKEN || '']);
