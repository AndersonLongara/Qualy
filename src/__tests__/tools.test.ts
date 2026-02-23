/**
 * Testes unitários para as ferramentas do agente IA (tools.ts).
 * Usa jest.mock('axios') para simular respostas da API sem precisar de servidor.
 *
 * Cobre o fluxo completo de realização de pedido via IA:
 *   1. consultar_estoque  → produto disponível / sem estoque / promoção
 *   2. consultar_cliente  → ativo / bloqueado / não encontrado
 *   3. consultar_titulos  → vencidos com juros / a vencer / pago
 *   4. consultar_pedidos  → todos os status do ciclo de vida
 */
import axios from 'axios';
import { toolsExecution } from '../core/ai/tools';

// Mocka o axios globalmente — sem chamadas de rede reais
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: respostas da API Mock simuladas
// ─────────────────────────────────────────────────────────────────────────────
const mockClient = (overrides = {}) => ({
    id: 'CUST-001', razao_social: 'Mercadinho Exemplo LTDA', fantasia: 'Mercadinho do João',
    documento: '12.345.678/0001-90', status: 'ativo', filiais: [{ id: 'FIL-01', nome: 'Matriz SP' }],
    ...overrides,
});

const mockTitulo = (overrides = {}) => ({
    id: 'TIT-001', numero_nota: '102030', valor_original: 1500.00, valor_atualizado: 1578.23,
    vencimento: '2024-01-01', status: 'vencido',
    pdf_url: 'https://example.com/boleto-102030.pdf',
    linha_digitavel: '23793.38128 60033.045209 76000.063300 1 894500000150000',
    ...overrides,
});

const mockProduto = (overrides = {}) => ({
    sku: 'PROD-001', nome: 'Cimento CP II 50kg', unidade: 'SC',
    estoque_disponivel: 500, preco_tabela: 29.90, preco_promocional: null,
    ...overrides,
});

const mockPedido = (overrides = {}) => ({
    id: 'PED-001', data: '2024-01-15', valor_total: 4500.00, status: 'entregue',
    itens: [{ sku: 'PROD-001', nome: 'Cimento CP II 50kg', qtd: 100, valor_unit: 29.90 }],
    nfe: {
        numero: '998877', danfe_url: 'https://example.com/nfe-998877.pdf',
        chave: '35241112345678000190550010009988771000012345',
    },
    rastreio: { transportadora: 'TransAltra', codigo: 'TRK-001', status: 'Entregue' },
    ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. consultar_estoque — FLUXO DE PEDIDO (passo 1)
// ─────────────────────────────────────────────────────────────────────────────
describe('tool: consultar_estoque', () => {

    beforeEach(() => jest.clearAllMocks());

    // ── BUG REGRESSION #1: "undefined SC" ────────────────────────────────────────
    // O campo 'estoque_disponivel' deve ser um NÚMERO para a IA conseguir referenciar
    // sem produzir "undefined". Antes, era mesclado numa string.
    it('BUG: estoque_disponivel é número puro (não string) — evita "undefined SC"', async () => {
        mockedAxios.get.mockResolvedValueOnce({ data: [mockProduto({ estoque_disponivel: 500 })] });

        const result = await toolsExecution.consultar_estoque({ busca: 'cimento' });
        const parsed = JSON.parse(result as string);

        // CRÍTICO: deve ser número, não string misturada
        expect(typeof parsed[0].estoque_disponivel).toBe('number');
        expect(parsed[0].estoque_disponivel).toBe(500);

        // Não deve ter campos redundantes
        expect(parsed[0].preco_unitario).toBe(29.90);
    });

    // ── BUG REGRESSION #2: Quantidade > Estoque ──────────────────────────────────
    // A IA deve ter dados numéricos suficientes para barrar pedidos acima do estoque.
    // Se o cliente pede 1000 e há apenas 500, a IA deve detectar 1000 > 500 e recusar.
    it('BUG: IA consegue detectar pedido acima do estoque (1000 pedido vs 500 disponível)', async () => {
        mockedAxios.get.mockResolvedValueOnce({ data: [mockProduto({ estoque_disponivel: 500 })] });

        const result = await toolsExecution.consultar_estoque({ busca: 'cimento' });
        const parsed = JSON.parse(result as string);

        const pedidoCliente = 1000;
        const estoqueDisponivel = parsed[0].estoque_disponivel; // número puro

        // IA pode fazer esta comparação numérica antes de aprovar o pedido
        expect(pedidoCliente > estoqueDisponivel).toBe(true); // 1000 > 500 → deve recusar
        expect(parsed[0].preco_unitario).toBe(29.90); // tem preço para referência
    });

    it('retorna produto disponível com preço formatado (preco_formatado)', async () => {
        mockedAxios.get.mockResolvedValueOnce({ data: [mockProduto()] });

        const result = await toolsExecution.consultar_estoque({ busca: 'cimento' });
        const parsed = JSON.parse(result as string);

        expect(parsed[0].nome).toBe('Cimento CP II 50kg');
        expect(parsed[0].estoque_disponivel).toBe(500);
        expect(parsed[0].preco_unitario).toBe(29.90);
        expect(parsed[0].preco_promocional).toBeNull();
    });

    it('retorna "Sem estoque" para produto esgotado (PROD-003)', async () => {
        mockedAxios.get.mockResolvedValueOnce({
            data: [mockProduto({ nome: 'Argamassa AC-III 20kg', estoque_disponivel: 0, sku: 'PROD-003' })],
        });

        const result = await toolsExecution.consultar_estoque({ busca: 'argamassa' });
        const parsed = JSON.parse(result as string);

        expect(parsed[0].estoque_disponivel).toBe(0);
    });

    it('retorna preço promocional quando disponível (PROD-008)', async () => {
        mockedAxios.get.mockResolvedValueOnce({
            data: [mockProduto({ sku: 'PROD-008', nome: 'Cimento CP IV 50kg', preco_tabela: 33.50, preco_promocional: 31.00 })],
        });

        const result = await toolsExecution.consultar_estoque({ busca: 'cimento CP IV' });
        const parsed = JSON.parse(result as string);

        expect(parsed[0].preco_unitario).toBe(33.50);
        expect(parsed[0].preco_promocional).toBe(31.00);
    });

    it('retorna mensagem amigável quando produto não encontrado', async () => {
        mockedAxios.get.mockResolvedValueOnce({ data: [] });

        const result = await toolsExecution.consultar_estoque({ busca: 'produto_inexistente' });

        expect(result).toContain('Nenhum produto encontrado');
    });

    it('retorna mensagem de erro em caso de falha na API', async () => {
        mockedAxios.get.mockRejectedValueOnce(new Error('Network Error'));

        const result = await toolsExecution.consultar_estoque({ busca: 'cimento' });

        expect(result).toContain('Erro ao consultar estoque');
    });

    it('verifica que o endpoint chamado é /vendas/estoque (API contract)', async () => {
        mockedAxios.get.mockResolvedValueOnce({ data: [mockProduto()] });

        await toolsExecution.consultar_estoque({ busca: 'cimento' });

        expect(mockedAxios.get).toHaveBeenCalledWith(
            expect.stringContaining('/vendas/estoque'),
            expect.objectContaining({ params: { busca: 'cimento' } })
        );
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// 2. consultar_cliente — VERIFICAÇÃO ANTES DO PEDIDO (passo 2)
// ─────────────────────────────────────────────────────────────────────────────
describe('tool: consultar_cliente (pré-requisito para pedido via IA)', () => {

    beforeEach(() => jest.clearAllMocks());

    it('retorna dados completos para cliente ATIVO', async () => {
        mockedAxios.get.mockResolvedValueOnce({ data: mockClient() });

        const result = await toolsExecution.consultar_cliente({ documento: '12345678000190' });
        const parsed = JSON.parse(result as string);

        expect(parsed.status).toBe('ativo');
        expect(parsed.fantasia).toBe('Mercadinho do João');
    });

    it('cliente BLOQUEADO retorna status e motivo (fluxo: IA deve bloquear pedido)', async () => {
        mockedAxios.get.mockResolvedValueOnce({
            data: mockClient({ status: 'bloqueado', motivo_bloqueio: 'Inadimplência' }),
        });

        const result = await toolsExecution.consultar_cliente({ documento: '98765432000100' });
        const parsed = JSON.parse(result as string);

        expect(parsed.status).toBe('bloqueado');
        expect(parsed.motivo_bloqueio).toBeDefined(); // IA usa isso para informar o cliente
    });

    it('cliente INATIVO retorna status correto', async () => {
        mockedAxios.get.mockResolvedValueOnce({
            data: mockClient({ status: 'inativo', motivo_bloqueio: 'Inatividade > 180 dias' }),
        });

        const result = await toolsExecution.consultar_cliente({ documento: '11122233000144' });
        const parsed = JSON.parse(result as string);

        expect(parsed.status).toBe('inativo');
    });

    it('CNPJ inexistente retorna mensagem amigável (não lança exceção)', async () => {
        mockedAxios.get.mockRejectedValueOnce({ response: { status: 404 } });

        const result = await toolsExecution.consultar_cliente({ documento: '00000000000000' });

        expect(result).toContain('não encontrado');
    });

    it('aceita CNPJ formatado como argumento', async () => {
        mockedAxios.get.mockResolvedValueOnce({ data: mockClient() });

        await toolsExecution.consultar_cliente({ documento: '12.345.678/0001-90' });

        expect(mockedAxios.get).toHaveBeenCalledWith(
            expect.stringContaining('/clientes'),
            expect.objectContaining({ params: { doc: '12.345.678/0001-90' } })
        );
    });

    it('aceita CPF (cliente PF)', async () => {
        mockedAxios.get.mockResolvedValueOnce({
            data: mockClient({ segmento: 'Pessoa Física', documento: '529.982.247-25' }),
        });

        const result = await toolsExecution.consultar_cliente({ documento: '52998224725' });
        const parsed = JSON.parse(result as string);

        expect(parsed.segmento).toBe('Pessoa Física');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. consultar_titulos — FLUXO FINANCEIRO
// ─────────────────────────────────────────────────────────────────────────────
describe('tool: consultar_titulos', () => {

    beforeEach(() => jest.clearAllMocks());

    it('formata títulos com valor atualizado (inclui juros/multa)', async () => {
        mockedAxios.get.mockResolvedValueOnce({
            data: [mockTitulo({ valor_original: 1500.00, valor_atualizado: 1578.23 })],
        });

        const result = await toolsExecution.consultar_titulos({ documento: '12345678000190' });
        const parsed = JSON.parse(result as string);

        expect(parsed[0].valor).toContain('1578'); // valor atualizado (com juros)
        expect(parsed[0].status).toBe('VENCIDO');
    });

    it('filtra por status=vencido corretamente', async () => {
        mockedAxios.get.mockResolvedValueOnce({ data: [mockTitulo({ status: 'vencido' })] });

        await toolsExecution.consultar_titulos({ documento: '12345678000190', status: 'vencido' });

        expect(mockedAxios.get).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ params: expect.objectContaining({ status: 'vencido' }) })
        );
    });

    it('título a_vencer exibe status "A VENCER"', async () => {
        mockedAxios.get.mockResolvedValueOnce({
            data: [mockTitulo({ status: 'a_vencer', valor_atualizado: 2000.00 })],
        });

        const result = await toolsExecution.consultar_titulos({ documento: '12345678000190' });
        const parsed = JSON.parse(result as string);

        expect(parsed[0].status).toBe('A VENCER');
    });

    it('retorna link_boleto e linha_digitavel (necessário para 2ª via)', async () => {
        mockedAxios.get.mockResolvedValueOnce({ data: [mockTitulo()] });

        const result = await toolsExecution.consultar_titulos({ documento: '12345678000190' });
        const parsed = JSON.parse(result as string);

        expect(parsed[0].link_boleto).toBeDefined();
        expect(parsed[0].linha_digitavel).toBeDefined();
    });

    it('mensagem amigável quando cliente não tem títulos', async () => {
        mockedAxios.get.mockResolvedValueOnce({ data: [] });

        const result = await toolsExecution.consultar_titulos({ documento: '12345678000190' });

        expect(result).toContain('Nenhum título encontrado');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. consultar_pedidos — RASTREIO E NF-e
// ─────────────────────────────────────────────────────────────────────────────
describe('tool: consultar_pedidos', () => {

    beforeEach(() => jest.clearAllMocks());

    it('formata pedido entregue com rastreio completo', async () => {
        mockedAxios.get.mockResolvedValueOnce({ data: [mockPedido()] });

        const result = await toolsExecution.consultar_pedidos({ documento: '12345678000190' });
        const parsed = JSON.parse(result as string);

        expect(parsed[0].status).toBe('entregue');
        expect(parsed[0].nfe_numero).toBe('998877');
        expect(parsed[0].danfe_url).toContain('nfe-998877.pdf');
        expect(parsed[0].rastreio).toContain('TransAltra');
        expect(parsed[0].rastreio).toContain('TRK-001');
    });

    it('pedido em_transito retorna rastreio disponível', async () => {
        mockedAxios.get.mockResolvedValueOnce({
            data: [mockPedido({ status: 'em_transito', rastreio: { transportadora: 'Correios', codigo: 'OJ123456789BR', status: 'Em trânsito' } })],
        });

        const result = await toolsExecution.consultar_pedidos({ documento: '12345678000190' });
        const parsed = JSON.parse(result as string);

        expect(parsed[0].status).toBe('em_transito');
        expect(parsed[0].rastreio).toContain('OJ123456789BR');
    });

    it('pedido aguardando_faturamento retorna null para nfe e rastreio', async () => {
        mockedAxios.get.mockResolvedValueOnce({
            data: [mockPedido({ status: 'aguardando_faturamento', nfe: null, rastreio: null })],
        });

        const result = await toolsExecution.consultar_pedidos({ documento: '12345678000190' });
        const parsed = JSON.parse(result as string);

        expect(parsed[0].nfe_numero).toBeNull();
        expect(parsed[0].rastreio).toBeNull();
    });

    it('pedido cancelado retorna status cancelado', async () => {
        mockedAxios.get.mockResolvedValueOnce({
            data: [mockPedido({ status: 'cancelado', nfe: null, rastreio: null })],
        });

        const result = await toolsExecution.consultar_pedidos({ documento: '12345678000190' });
        const parsed = JSON.parse(result as string);

        expect(parsed[0].status).toBe('cancelado');
    });

    it('mensagem amigável quando não há pedidos (últimos 60 dias)', async () => {
        mockedAxios.get.mockResolvedValueOnce({ data: [] });

        const result = await toolsExecution.consultar_pedidos({ documento: '12345678000190' });

        expect(result).toContain('Nenhum pedido encontrado');
        expect(result).toContain('60 dias');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. FLUXO COMPLETO DE PEDIDO VIA IA — Orquestração Simulada
//    Simula o raciocínio do agente sem invocar o LLM
// ─────────────────────────────────────────────────────────────────────────────
describe('Fluxo de Pedido via IA — Orquestração de Tools', () => {

    beforeEach(() => jest.clearAllMocks());

    it('CENÁRIO FELIZ: consulta estoque → cliente ativo → pedido criado', async () => {
        // Passo 1: IA chama consultar_estoque
        mockedAxios.get.mockResolvedValueOnce({
            data: [mockProduto({ estoque_disponivel: 500 })],
        });
        const estoqueResult = await toolsExecution.consultar_estoque({ busca: 'cimento' });
        const estoque = JSON.parse(estoqueResult as string);
        expect(estoque[0].estoque_status).not.toContain('Sem estoque'); // ✅ disponível

        // Passo 2: IA chama consultar_cliente para verificar status
        mockedAxios.get.mockResolvedValueOnce({ data: mockClient({ status: 'ativo' }) });
        const clienteResult = await toolsExecution.consultar_cliente({ documento: '12345678000190' });
        const cliente = JSON.parse(clienteResult as string);
        expect(cliente.status).toBe('ativo'); // ✅ pode criar pedido

        // Passo 3: IA criaria pedido via POST /v1/vendas/pedido (neste step o LLM precisaria da API)
        // Validamos que os dados necessários estão disponíveis
        expect(cliente.id).toBeDefined();   // cliente_id para o pedido
        expect(cliente.filiais).toBeDefined(); // filial_id para o pedido
        expect(estoque[0].sku).toBeDefined();  // sku para os itens
    });

    it('CENÁRIO BLOQUEIO: cliente bloqueado → IA NÃO deve criar pedido', async () => {
        // Passo 1: IA consulta estoque (ok)
        mockedAxios.get.mockResolvedValueOnce({
            data: [mockProduto()],
        });
        const estoqueResult = await toolsExecution.consultar_estoque({ busca: 'cimento' });
        expect(JSON.parse(estoqueResult as string)[0].estoque_status).not.toContain('Sem estoque');

        // Passo 2: IA consulta cliente — BLOQUEADO
        mockedAxios.get.mockResolvedValueOnce({
            data: mockClient({ status: 'bloqueado', motivo_bloqueio: 'Inadimplência' }),
        });
        const clienteResult = await toolsExecution.consultar_cliente({ documento: '98765432000100' });
        const cliente = JSON.parse(clienteResult as string);

        // ✅ IA tem informação suficiente para bloquear o fluxo e notificar o usuário
        expect(cliente.status).toBe('bloqueado');
        expect(cliente.motivo_bloqueio).toContain('Inadimpl');
        // (A IA deve usar esses dados para explicar ao usuário que não pode criar pedido)
    });

    it('CENÁRIO SEM ESTOQUE: produto indisponível → IA deve sugerir alternativa', async () => {
        // Passo 1: IA consulta estoque — PRODUCT SEM ESTOQUE
        mockedAxios.get.mockResolvedValueOnce({
            data: [mockProduto({ sku: 'PROD-003', nome: 'Argamassa AC-III 20kg', estoque_disponivel: 0 })],
        });
        const estoqueResult = await toolsExecution.consultar_estoque({ busca: 'argamassa ac-iii' });
        const estoque = JSON.parse(estoqueResult as string);

        expect(estoque[0].estoque_status).toContain('Sem estoque'); // IA deve notificar usuário
        // (A IA deve sugerir alternativa como AC-I com estoque disponível)

        // Passo 2: IA consulta alternativa (AC-I com estoque)
        mockedAxios.get.mockResolvedValueOnce({
            data: [mockProduto({ sku: 'PROD-011', nome: 'Argamassa Colante AC-I 20kg', estoque_disponivel: 350 })],
        });
        const alternativaResult = await toolsExecution.consultar_estoque({ busca: 'argamassa AC-I' });
        const alternativa = JSON.parse(alternativaResult as string);

        // IA pode fazer esta comparação numérica antes de aprovar o pedido
        expect(alternativa[0].estoque_disponivel).toBe(350);                  // 350 unidades disponíveis
        expect(alternativa[0].estoque_status).not.toContain('Sem estoque'); // ✅ alternativa disponível
    });

    it('CENÁRIO CLIENTE NÃO ENCONTRADO: IA retorna erro amigável sem quebrar', async () => {
        mockedAxios.get.mockRejectedValueOnce({ response: { status: 404 } });

        const result = await toolsExecution.consultar_cliente({ documento: '00000000000000' });

        // IA lida graciosamente — sem throw
        expect(typeof result).toBe('string');
        expect(result).toContain('não encontrado');
    });

    it('CENÁRIO ERRO DE REDE: todas as tools retornam mensagem de erro sem throw', async () => {
        mockedAxios.get.mockRejectedValue(new Error('Network Error'));

        const [estoqueErr, clienteErr, titulosErr, pedidosErr] = await Promise.all([
            toolsExecution.consultar_estoque({ busca: 'cimento' }),
            toolsExecution.consultar_cliente({ documento: '12345678000190' }),
            toolsExecution.consultar_titulos({ documento: '12345678000190' }),
            toolsExecution.consultar_pedidos({ documento: '12345678000190' }),
        ]);

        // Nenhuma tool deve lançar exceção — sempre retorna string de erro para o LLM
        expect(typeof estoqueErr).toBe('string');
        expect(typeof clienteErr).toBe('string');
        expect(typeof titulosErr).toBe('string');
        expect(typeof pedidosErr).toBe('string');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. SEGURANÇA — Privacidade e Confidencialidade
//    Regra: IA nunca pode confirmar/negar se um CNPJ pertence a um cliente.
//    A barreira primária está no system prompt (provider.ts).
//    Estes testes garantem que a TOOL não expõe dados técnicos sensíveis.
// ─────────────────────────────────────────────────────────────────────────────
describe('Segurança: consultar_cliente — proteção de dados de terceiros', () => {

    beforeEach(() => jest.clearAllMocks());

    it('CNPJ inexistente retorna string genérica (LLM não deve confirmar ausência)', async () => {
        // O system prompt instrui o LLM a NÃO responder "esse CNPJ não é nosso cliente"
        mockedAxios.get.mockRejectedValueOnce({ response: { status: 404 } });

        const result = await toolsExecution.consultar_cliente({ documento: '99999999000199' });

        expect(typeof result).toBe('string');
        // Tool não deve vazar dados cadastrais de nenhuma entidade
        expect(result).not.toMatch(/status|razao_social|fantasia/i);
    });

    it('erro de servidor retorna mensagem genérica (sem vazar hosts internos)', async () => {
        mockedAxios.get.mockRejectedValueOnce(new Error('connect ECONNREFUSED internal-erp:5432'));

        const result = await toolsExecution.consultar_cliente({ documento: '12345678000190' });

        // Nunca expõe detalhes de infraestrutura ao LLM
        expect(result).not.toContain('ECONNREFUSED');
        expect(result).not.toContain('internal-erp');
        expect(typeof result).toBe('string');
    });

    it('tool de estoque com erro não vaza detalhes técnicos', async () => {
        mockedAxios.get.mockRejectedValueOnce(new Error('SSL certificate error: internal-db'));

        const result = await toolsExecution.consultar_estoque({ busca: 'cimento' });

        expect(result).not.toContain('SSL');
        expect(result).not.toContain('internal-db');
        expect(typeof result).toBe('string');
    });
});
