/**
 * Testes do webhook (C12) e da rota de config (C8).
 */
import request from 'supertest';
import { app } from '../mock/server';

describe('GET /api/config', () => {
    it('retorna assistantName, companyName e greeting', async () => {
        const res = await request(app).get('/api/config');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('assistantName');
        expect(res.body).toHaveProperty('companyName');
        expect(res.body).toHaveProperty('greeting');
        expect(res.body.greeting).toMatch(/assistente virtual|Como posso ajudar/);
    });

    it('retorna webhookUrl personalizada por tenant e webhookSecretConfigured', async () => {
        const res = await request(app).get('/api/config');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('webhookUrl');
        expect(typeof res.body.webhookUrl).toBe('string');
        expect(res.body.webhookUrl).toMatch(/\/webhook\/messages\/[^/]+$/);
        expect(res.body).toHaveProperty('webhookSecretConfigured');
        expect(typeof res.body.webhookSecretConfigured).toBe('boolean');
    });

    it('webhookUrl inclui o tenant quando enviado no header', async () => {
        const res = await request(app).get('/api/config').set('X-Tenant-Id', 'Docedavovo');
        expect(res.status).toBe(200);
        expect(res.body.webhookUrl).toMatch(/\/webhook\/messages\/Docedavovo$/);
    });
});

describe('POST /webhook/messages', () => {
    beforeAll(() => {
        delete process.env.SOUCHAT_WEBHOOK_SECRET;
        delete process.env.WEBHOOK_SECRET;
    });
    it('retorna 400 quando falta phone', async () => {
        const res = await request(app)
            .post('/webhook/messages')
            .send({ message: 'oi' });
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'Payload inválido');
    });

    it('retorna 400 quando falta message', async () => {
        const res = await request(app)
            .post('/webhook/messages')
            .send({ phone: '5511999999999' });
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'Payload inválido');
    });

    it('retorna 200 e reply com phone e message válidos', async () => {
        const res = await request(app)
            .post('/webhook/messages')
            .send({ phone: `webhook-test-${Date.now()}`, message: 'olá' });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('reply');
        expect(typeof res.body.reply).toBe('string');
        expect(res.body.reply.length).toBeGreaterThan(0);
    });

    it('aceita alias from/text (formato alternativo)', async () => {
        const res = await request(app)
            .post('/webhook/messages')
            .send({ from: `webhook-from-${Date.now()}`, text: 'oi' });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('reply');
    });
});

describe('POST /webhook/messages/:tenantId (URL personalizada por empresa)', () => {
    beforeAll(() => {
        delete process.env.SOUCHAT_WEBHOOK_SECRET;
        delete process.env.WEBHOOK_SECRET;
    });
    it('processa mensagem usando tenant da URL', async () => {
        const res = await request(app)
            .post('/webhook/messages/default')
            .send({ phone: `wh-${Date.now()}`, message: 'teste' });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('reply');
    });
    it('retorna 400 quando falta phone ou message', async () => {
        const res = await request(app)
            .post('/webhook/messages/default')
            .send({ message: 'só message' });
        expect(res.status).toBe(400);
    });
});

describe('GET /api/usage (M6)', () => {
    it('retorna 400 quando falta tenantId', async () => {
        const res = await request(app).get('/api/usage');
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('code', 'MISSING_TENANT_ID');
    });

    it('retorna 200 e totais (prompt_tokens, completion_tokens, total_tokens)', async () => {
        const res = await request(app).get('/api/usage').query({ tenantId: 'default' });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('prompt_tokens');
        expect(res.body).toHaveProperty('completion_tokens');
        expect(res.body).toHaveProperty('total_tokens');
        expect(typeof res.body.prompt_tokens).toBe('number');
        expect(typeof res.body.completion_tokens).toBe('number');
        expect(typeof res.body.total_tokens).toBe('number');
    });
});
