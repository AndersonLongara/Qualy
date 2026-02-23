/**
 * Testes para processChatMessage (C13).
 * Garante que a lógica extraída preserva o comportamento de /api/chat.
 */
import { processChatMessage } from '../../core/chat/processChat';
import { __resetConfigCache } from '../../config/tenant';

describe('processChatMessage', () => {
    beforeEach(() => {
        __resetConfigCache();
    });

    it('responde saudação com nome da config (GREETING)', async () => {
        const phone = `test-greeting-${Date.now()}`;
        const { reply } = await processChatMessage('default', phone, 'oi', []);
        expect(reply).toMatch(/Olá! Sou a .+, assistente virtual/);
        expect(reply).toContain('Como posso ajudar');
    });

    it('responde HUMAN_AGENT com mensagem de transferência', async () => {
        const phone = `test-human-${Date.now()}`;
        const { reply } = await processChatMessage('default', phone, 'quero falar com um humano', []);
        expect(reply).toMatch(/atendentes|transferir/);
    });

    it('retorna reply e debug opcional', async () => {
        const phone = `test-structure-${Date.now()}`;
        const result = await processChatMessage('default', phone, 'olá', []);
        expect(result).toHaveProperty('reply');
        expect(typeof result.reply).toBe('string');
        expect(result.reply.length).toBeGreaterThan(0);
    });

    it('com histórico vazio limpa a sessão e responde', async () => {
        const phone = `test-clear-${Date.now()}`;
        const r1 = await processChatMessage('default', phone, 'oi', []);
        expect(r1.reply).toBeTruthy();
        const r2 = await processChatMessage('default', phone, 'tchau', []); // history [] = clear
        expect(r2.reply).toBeTruthy();
    });
});
