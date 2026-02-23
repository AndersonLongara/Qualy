/**
 * Testes dos endpoints GET /api/executions e GET /api/executions/:id,
 * e da integração: execuções registradas após /api/chat e /webhook/messages.
 */
import request from 'supertest';
import { app } from '../mock/server';

beforeAll(() => {
    delete process.env.SOUCHAT_WEBHOOK_SECRET;
    delete process.env.WEBHOOK_SECRET;
});

describe('GET /api/executions', () => {
    it('retorna 200 com items e total', async () => {
        const res = await request(app).get('/api/executions');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('items');
        expect(res.body).toHaveProperty('total');
        expect(Array.isArray(res.body.items)).toBe(true);
        expect(typeof res.body.total).toBe('number');
    });

    it('aceita query limit e offset', async () => {
        const res = await request(app).get('/api/executions?limit=5&offset=0');
        expect(res.status).toBe(200);
        expect(res.body.items.length).toBeLessThanOrEqual(5);
    });

    it('aceita query phone para filtrar', async () => {
        const res = await request(app).get('/api/executions?phone=5511');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('items');
        expect(res.body).toHaveProperty('total');
    });

    it('cada item tem id, phone, message, reply, status, durationMs, timestamp, source', async () => {
        const res = await request(app).get('/api/executions?limit=1');
        expect(res.status).toBe(200);
        if (res.body.items.length > 0) {
            const item = res.body.items[0];
            expect(item).toHaveProperty('id');
            expect(item).toHaveProperty('phone');
            expect(item).toHaveProperty('message');
            expect(item).toHaveProperty('reply');
            expect(item).toHaveProperty('status');
            expect(item).toHaveProperty('durationMs');
            expect(item).toHaveProperty('timestamp');
            expect(item).toHaveProperty('source');
        }
    });
});

describe('GET /api/executions/:id', () => {
    it('retorna 404 para id inexistente', async () => {
        const res = await request(app).get('/api/executions/id-inexistente-xyz');
        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('error');
        expect(res.body).toHaveProperty('code', 'EXECUTION_NOT_FOUND');
    });

    it('retorna 200 e execução completa quando existe', async () => {
        const phone = `detail-${Date.now()}`;
        const postRes = await request(app).post('/webhook/messages').send({ phone, message: 'oi' });
        expect(postRes.status).toBe(200);
        const listRes = await request(app).get('/api/executions?phone=' + encodeURIComponent(phone));
        expect(listRes.status).toBe(200);
        expect(listRes.body.items.length).toBeGreaterThanOrEqual(1);
        const id = listRes.body.items[0].id;
        const detailRes = await request(app).get(`/api/executions/${id}`);
        expect(detailRes.status).toBe(200);
        expect(detailRes.body).toHaveProperty('id', id);
        expect(detailRes.body).toHaveProperty('phone');
        expect(detailRes.body).toHaveProperty('message');
        expect(detailRes.body).toHaveProperty('reply');
        expect(detailRes.body).toHaveProperty('status');
        expect(detailRes.body).toHaveProperty('durationMs');
        expect(detailRes.body).toHaveProperty('timestamp');
        expect(detailRes.body).toHaveProperty('source');
    });
});

describe('Registro de execuções', () => {
    it('POST /webhook/messages registra execução na lista', async () => {
        const phone = `exec-reg-${Date.now()}`;
        const postRes = await request(app)
            .post('/webhook/messages')
            .send({ phone, message: 'teste registro' });
        expect(postRes.status).toBe(200);
        const listRes = await request(app).get('/api/executions?phone=' + encodeURIComponent(phone));
        expect(listRes.status).toBe(200);
        expect(listRes.body.items.length).toBeGreaterThanOrEqual(1);
        const found = listRes.body.items.find((e: { phone: string }) => e.phone === phone);
        expect(found).toBeDefined();
        expect(found.source).toBe('webhook');
        expect(found.status).toBe('ok');
    });

    it('POST /api/chat registra execução com source api', async () => {
        const phone = `exec-chat-${Date.now()}`;
        const postRes = await request(app)
            .post('/api/chat')
            .send({ phone, message: 'olá' });
        expect(postRes.status).toBe(200);
        const listRes = await request(app).get('/api/executions?phone=' + encodeURIComponent(phone));
        expect(listRes.status).toBe(200);
        const found = listRes.body.items.find((e: { phone: string }) => e.phone === phone);
        expect(found).toBeDefined();
        expect(found.source).toBe('api');
    });
});
