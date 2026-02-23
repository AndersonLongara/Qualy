/**
 * Testes do fluxo de chat: intent "sim quero N unidades" e order flow.
 * Garante que o cenário "consulta PROD-008 → sim quero 2 unidades" seja tratado
 * pelo order flow (não pelo LLM) e que a resposta não seja "..." ou vazia.
 */
import { detectIntent, parseQuantityFromOrderMessage } from '../core/ai/intent';
import { createOrderSession, processOrderFlow } from '../core/ai/order-flow';

const lastProductPROD008 = {
    nome: 'Cimento CP IV 50kg (Baixo Calor)',
    sku: 'PROD-008',
    estoque_disponivel: 80,
    preco_unitario: 33.5,
    preco_promocional: 31.0,
};

describe('Cenário: consulta PROD-008 → sim quero 2 unidades', () => {

    describe('Intent: "sim quero 2 unidades do produto"', () => {
        it('deve ser classificado como START_ORDER_WITH_QUANTITY (não UNKNOWN)', () => {
            expect(detectIntent('sim quero 2 unidades do produto')).toBe('START_ORDER_WITH_QUANTITY');
        });

        it('deve classificar variações como START_ORDER_WITH_QUANTITY', () => {
            expect(detectIntent('quero 2 unidades')).toBe('START_ORDER_WITH_QUANTITY');
            expect(detectIntent('sim, quero 5 unidades')).toBe('START_ORDER_WITH_QUANTITY');
            expect(detectIntent('2 unidades do produto')).toBe('START_ORDER_WITH_QUANTITY');
        });
    });

    describe('parseQuantityFromOrderMessage', () => {
        it('extrai quantidade da mensagem', () => {
            expect(parseQuantityFromOrderMessage('sim quero 2 unidades do produto')).toBe(2);
            expect(parseQuantityFromOrderMessage('quero 5 unidades')).toBe(5);
            expect(parseQuantityFromOrderMessage('10 unidades')).toBe(10);
        });
        it('retorna null quando não há número válido', () => {
            expect(parseQuantityFromOrderMessage('quero unidades')).toBeNull();
        });
    });

    describe('Order flow: resposta ao "sim quero 2 unidades" com lastProduct', () => {
        it('ativa o order flow e pede CPF/CNPJ (resposta não é "..." ou vazia)', async () => {
            const session = createOrderSession();
            session.product = lastProductPROD008;

            const result = await processOrderFlow(
                'sim quero 2 unidades do produto',
                session,
                'START_ORDER_WITH_QUANTITY'
            );

            expect(result.reply).toBeTruthy();
            expect(result.reply.length).toBeGreaterThan(10);
            expect(result.reply).not.toMatch(/^\.{2,}\s*$/);
            expect(result.reply).not.toBe('...');
            expect(result.reply.toLowerCase()).toMatch(/cpf|cnpj/);
            expect(result.newState.state).toBe('awaiting_cpf');
            expect(result.newState.quantity).toBe(2);
        });

        it('inclui total e quantidade na mensagem', async () => {
            const session = createOrderSession();
            session.product = lastProductPROD008;

            const result = await processOrderFlow('quero 2 unidades', session, 'START_ORDER_WITH_QUANTITY');

            expect(result.reply).toContain('2 unidades');
            expect(result.reply).toContain('Cimento CP IV');
            expect(result.reply).toMatch(/R\$\s*62[,.]00/); // 31 * 2
        });
    });
});
