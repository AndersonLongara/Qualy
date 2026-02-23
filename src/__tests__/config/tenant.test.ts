/**
 * Testes do módulo de config (getConfig, TenantConfig).
 * C1/C2: defaults sem arquivo, merge com tenant.json, env sobrescreve.
 */
import path from 'path';
import fs from 'fs';
import { getConfig, __resetConfigCache, TenantConfig } from '../../config/tenant';

describe('getConfig()', () => {
    const originalEnv: Record<string, string | undefined> = {};

    beforeAll(() => {
        ['API_BASE_URL', 'ASSISTANT_NAME', 'COMPANY_NAME', 'SYSTEM_PROMPT_PATH'].forEach((key) => {
            originalEnv[key] = process.env[key];
        });
    });

    beforeEach(() => {
        __resetConfigCache();
        ['API_BASE_URL', 'ASSISTANT_NAME', 'COMPANY_NAME', 'SYSTEM_PROMPT_PATH'].forEach((key) => {
            delete process.env[key];
        });
    });

    afterAll(() => {
        Object.keys(originalEnv).forEach((key) => {
            if (originalEnv[key] !== undefined) process.env[key] = originalEnv[key];
            else delete process.env[key];
        });
        __resetConfigCache();
    });

    it('retorna objeto com as keys esperadas (branding, api, prompt, features)', () => {
        const config = getConfig();
        expect(config).toHaveProperty('branding');
        expect(config).toHaveProperty('api');
        expect(config).toHaveProperty('prompt');
        expect(config).toHaveProperty('features');
        expect(config.branding).toHaveProperty('companyName');
        expect(config.branding).toHaveProperty('assistantName');
        expect(config.api).toHaveProperty('baseUrl');
        expect(config.prompt).toHaveProperty('systemPromptPath');
        expect(config.prompt).toHaveProperty('systemPrompt');
        expect(config.features).toHaveProperty('orderFlowEnabled');
        expect(config.features).toHaveProperty('financialEnabled');
    });

    it('sem arquivo e sem env, retorna defaults AltraFlow e localhost:3001', () => {
        const config = getConfig();
        expect(config.branding.assistantName).toBe('AltraFlow');
        expect(config.branding.companyName).toBe('AltraFlow');
        expect(config.api.baseUrl).toBe('http://localhost:3001');
        expect(config.features.orderFlowEnabled).toBe(true);
        expect(config.features.financialEnabled).toBe(true);
    });

    it('env ASSISTANT_NAME sobrescreve default', () => {
        process.env.ASSISTANT_NAME = 'MeuAssistente';
        __resetConfigCache();
        const config = getConfig();
        expect(config.branding.assistantName).toBe('MeuAssistente');
    });

    it('env API_BASE_URL sobrescreve default', () => {
        process.env.API_BASE_URL = 'https://api.exemplo.com';
        __resetConfigCache();
        const config = getConfig();
        expect(config.api.baseUrl).toBe('https://api.exemplo.com');
    });

    it('env COMPANY_NAME sobrescreve default', () => {
        process.env.COMPANY_NAME = 'Minha Empresa';
        __resetConfigCache();
        const config = getConfig();
        expect(config.branding.companyName).toBe('Minha Empresa');
    });

    it('retorno é imutável (Object.freeze)', () => {
        const config = getConfig();
        expect(() => {
            (config as any).branding.assistantName = 'x';
        }).toThrow();
    });

    it('não lança quando config/tenant.json não existe', () => {
        expect(() => getConfig()).not.toThrow();
    });
});

describe('getConfig() com tenant.json', () => {
    const fixturesDir = path.join(__dirname, 'fixtures');
    const realCwd = process.cwd();

    beforeAll(() => {
        if (!fs.existsSync(fixturesDir)) fs.mkdirSync(fixturesDir, { recursive: true });
    });

    beforeEach(() => __resetConfigCache());

    it('com arquivo válido, faz merge com defaults', () => {
        const testDir = path.join(fixturesDir, 'merge');
        const configDir = path.join(testDir, 'config');
        if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
        const tenantPath = path.join(configDir, 'tenant.json');
        fs.writeFileSync(
            tenantPath,
            JSON.stringify({
                branding: { assistantName: 'Assistente Teste', companyName: 'Empresa Teste' },
            }),
            'utf8'
        );
        const originalCwd = process.cwd();
        process.chdir(testDir);
        __resetConfigCache();
        try {
            const config = getConfig();
            expect(config.branding.assistantName).toBe('Assistente Teste');
            expect(config.branding.companyName).toBe('Empresa Teste');
            expect(config.api.baseUrl).toBe('http://localhost:3001');
        } finally {
            process.chdir(originalCwd);
            __resetConfigCache();
        }
    });

    it('não lança quando JSON é malformado (usa defaults)', () => {
        const testDir = path.join(fixturesDir, 'invalid');
        const configDir = path.join(testDir, 'config');
        if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(path.join(configDir, 'tenant.json'), '{ invalid json', 'utf8');
        const originalCwd = process.cwd();
        process.chdir(testDir);
        __resetConfigCache();
        try {
            expect(() => getConfig()).not.toThrow();
            const config = getConfig();
            expect(config.branding.assistantName).toBe('AltraFlow');
        } finally {
            process.chdir(originalCwd);
            __resetConfigCache();
        }
    });
});
