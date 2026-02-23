/**
 * Testes unitários do executionStore (painel de configuração).
 */
import { executionStore } from '../mock/executionStore';

describe('executionStore', () => {
    const baseInput = {
        tenantId: 'default',
        phone: '5511999999999',
        message: 'Olá',
        reply: 'Olá! Como posso ajudar?',
        status: 'ok' as const,
        durationMs: 120,
        source: 'api' as const,
    };

    it('add retorna execução com id e timestamp', async () => {
        const exec = await executionStore.add(baseInput);
        expect(exec).toHaveProperty('id');
        expect(exec.id).toBeTruthy();
        expect(exec).toHaveProperty('timestamp');
        expect(exec.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        expect(exec.phone).toBe(baseInput.phone);
        expect(exec.message).toBe(baseInput.message);
        expect(exec.reply).toBe(baseInput.reply);
        expect(exec.status).toBe('ok');
        expect(exec.durationMs).toBe(120);
        expect(exec.source).toBe('api');
    });

    it('add com debug persiste o campo', async () => {
        const debug = { messages: [{ role: 'user', content: 'test' }] };
        const exec = await executionStore.add({ ...baseInput, phone: '5511888888888', debug });
        expect(exec.debug).toEqual(debug);
    });

    it('list retorna items e total', async () => {
        const phone = `list-test-${Date.now()}`;
        await executionStore.add({ ...baseInput, phone });
        const result = await executionStore.list({ limit: 10, offset: 0, tenantId: 'default' });
        expect(result).toHaveProperty('items');
        expect(result).toHaveProperty('total');
        expect(Array.isArray(result.items)).toBe(true);
        expect(result.total).toBeGreaterThanOrEqual(1);
    });

    it('list aplica limit e offset', async () => {
        const result = await executionStore.list({ limit: 2, offset: 0, tenantId: 'default' });
        expect(result.items.length).toBeLessThanOrEqual(2);
        const resultOffset = await executionStore.list({ limit: 2, offset: 1, tenantId: 'default' });
        expect(resultOffset.items.length).toBeLessThanOrEqual(2);
    });

    it('list filtra por phone quando informado', async () => {
        const phone = `filter-${Date.now()}`;
        await executionStore.add({ ...baseInput, phone });
        const result = await executionStore.list({ limit: 50, offset: 0, phone, tenantId: 'default' });
        expect(result.items.every(e => e.phone.includes(phone))).toBe(true);
    });

    it('list trunca message e reply nos items (resumo)', async () => {
        const longMessage = 'a'.repeat(100);
        const longReply = 'b'.repeat(100);
        const phone = `trunc-${Date.now()}`;
        await executionStore.add({
            ...baseInput,
            phone,
            message: longMessage,
            reply: longReply,
        });
        const result = await executionStore.list({ limit: 50, offset: 0, phone, tenantId: 'default' });
        const item = result.items.find(e => e.phone === phone);
        expect(item).toBeDefined();
        expect(item!.message.length).toBeLessThanOrEqual(81);
        expect(item!.reply.length).toBeLessThanOrEqual(81);
        if (item!.message.length === 81) expect(item!.message.endsWith('…')).toBe(true);
    });

    it('getById retorna execução completa quando existe', async () => {
        const added = await executionStore.add({ ...baseInput, phone: `getbyid-${Date.now()}` });
        const found = await executionStore.getById(added.id);
        expect(found).not.toBeNull();
        expect(found!.id).toBe(added.id);
        expect(found!.message).toBe(baseInput.message);
        expect(found!.reply).toBe(baseInput.reply);
    });

    it('getById retorna null quando id não existe', async () => {
        const found = await executionStore.getById('id-inexistente-12345');
        expect(found).toBeNull();
    });

    it('não excede 500 itens (FIFO)', async () => {
        const store = executionStore as { add: typeof executionStore.add; list: typeof executionStore.list };
        for (let i = 0; i < 600; i++) {
            await store.add({ ...baseInput, phone: `stress-${i}-${Date.now()}` });
        }
        const result = await store.list({ limit: 1000, offset: 0, tenantId: 'default' });
        expect(result.total).toBeLessThanOrEqual(500);
        expect(result.items.length).toBeLessThanOrEqual(500);
    });
});
