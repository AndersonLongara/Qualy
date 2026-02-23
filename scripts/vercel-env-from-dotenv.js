#!/usr/bin/env node
/**
 * Lê .env.local e adiciona cada variável ao projeto Vercel (production e preview).
 * Uso: node scripts/vercel-env-from-dotenv.js
 * Requer: Vercel CLI (vercel) e projeto linkado (vercel link).
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const envPath = path.join(__dirname, '..', '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('.env.local não encontrado.');
  process.exit(1);
}

const content = fs.readFileSync(envPath, 'utf8');
const lines = content.split(/\r?\n/);
const vars = [];
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq <= 0) continue;
  const name = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  if (name && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) vars.push({ name, value });
}

function addEnv(name, value, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn('vercel', ['env', 'add', name, environment], {
      stdio: ['pipe', 'inherit', 'inherit'],
      shell: true,
    });
    child.stdin.write(value + '\n');
    child.stdin.end();
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
  });
}

(async () => {
  for (const { name, value } of vars) {
    try {
      console.log(`Adicionando ${name} (production)...`);
      await addEnv(name, value, 'production');
      console.log(`Adicionando ${name} (preview)...`);
      await addEnv(name, value, 'preview');
    } catch (e) {
      console.warn(`Aviso: ${name} falhou (pode já existir):`, e.message);
    }
  }
  console.log('Concluído. Rode vercel --prod para redeploy com as novas variáveis.');
})();
