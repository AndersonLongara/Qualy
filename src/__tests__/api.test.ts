import request from 'supertest';
import app from '../mock/app';

describe('Mock API — Integração Completa', () => {

    // ─────────────────────────────────────────────────────────────────────────
    // GET /v1/clientes — 6 perfis
    // ─────────────────────────────────────────────────────────────────────────
    describe('GET /v1/clientes', () => {
        it('retorna ATIVO (Mercadinho do João)', async () => {
            const res = await request(app).get('/v1/clientes?doc=12345678000190');
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('ativo');
            expect(res.body.fantasia).toBe('Mercadinho do João');
            expect(res.body.filiais).toHaveLength(3); // 3 filiais
        });

        it('retorna BLOQUEADO por inadimplência (Pão Quente)', async () => {
            const res = await request(app).get('/v1/clientes?doc=98765432000100');
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('bloqueado');
            expect(res.body.motivo_bloqueio).toContain('Inadimpl');
        });

        it('retorna BLOQUEADO por limite de crédito (Depósito Central)', async () => {
            const res = await request(app).get('/v1/clientes?doc=33344455000166');
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('bloqueado');
            expect(res.body.motivo_bloqueio).toContain('Limite');
        });

        it('retorna INATIVO (Silva Materiais)', async () => {
            const res = await request(app).get('/v1/clientes?doc=11122233000144');
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('inativo');
        });

        it('retorna cliente ATIVO grande conta (Horizonte)', async () => {
            const res = await request(app).get('/v1/clientes?doc=55566677000188');
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('ativo');
        });

        it('retorna cliente PF (CPF — José Silva)', async () => {
            const res = await request(app).get('/v1/clientes?doc=52998224725');
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('ativo');
            expect(res.body.segmento).toBe('Pessoa Física');
        });

        it('aceita CNPJ formatado (com pontuação)', async () => {
            const res = await request(app).get('/v1/clientes?doc=12.345.678/0001-90');
            expect(res.status).toBe(200);
            expect(res.body.id).toBe('CUST-001');
        });

        it('retorna 404 para CNPJ inexistente', async () => {
            const res = await request(app).get('/v1/clientes?doc=00000000000000');
            expect(res.status).toBe(404);
            expect(res.body.code).toBe('CLIENT_NOT_FOUND');
        });

        it('resposta contém campos obrigatórios (API_SPEC)', async () => {
            const res = await request(app).get('/v1/clientes?doc=12345678000190');
            expect(res.body).toHaveProperty('id');
            expect(res.body).toHaveProperty('razao_social');
            expect(res.body).toHaveProperty('fantasia');
            expect(res.body).toHaveProperty('documento');
            expect(res.body).toHaveProperty('status');
            expect(res.body).toHaveProperty('filiais');
            expect(Array.isArray(res.body.filiais)).toBe(true);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // POST /v1/auth — OTP 3 cenários
    // ─────────────────────────────────────────────────────────────────────────
    describe('POST /v1/auth/verify-code', () => {
        it('retorna token para código VÁLIDO (123456)', async () => {
            const res = await request(app).post('/v1/auth/verify-code').send({ code: '123456' });
            expect(res.status).toBe(200);
            expect(res.body.token).toBe('MOCK_TOKEN_123');
            expect(res.body.expires_in).toBe(600); // 10 minutos
        });

        it('retorna CODE_EXPIRED para código expirado (000000)', async () => {
            const res = await request(app).post('/v1/auth/verify-code').send({ code: '000000' });
            expect(res.status).toBe(401);
            expect(res.body.code).toBe('CODE_EXPIRED');
        });

        it('retorna INVALID_CODE para código incorreto', async () => {
            const res = await request(app).post('/v1/auth/verify-code').send({ code: '999999' });
            expect(res.status).toBe(401);
            expect(res.body.code).toBe('INVALID_CODE');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // GET /v1/financeiro/titulos — ciclo completo de títulos
    // ─────────────────────────────────────────────────────────────────────────
    describe('GET /v1/financeiro/titulos', () => {
        it('retorna todos os títulos do cliente A (4 títulos)', async () => {
            const res = await request(app).get('/v1/financeiro/titulos?doc=12345678000190');
            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(4);
        });

        it('TIT-001 vencido tem juros/multa aplicado', async () => {
            const res = await request(app).get('/v1/financeiro/titulos?doc=12345678000190&status=vencido');
            const tit = res.body.find((t: any) => t.id === 'TIT-001');
            expect(tit).toBeDefined();
            expect(tit.valor_atualizado).toBeGreaterThan(tit.valor_original); // valor corrigido
            expect(tit.juros_multa).toBeGreaterThan(0);
        });

        it('filtra por status=vencido: todos são vencidos', async () => {
            const res = await request(app).get('/v1/financeiro/titulos?doc=12345678000190&status=vencido');
            expect(res.status).toBe(200);
            res.body.forEach((t: any) => expect(t.status).toBe('vencido'));
        });

        it('filtra por status=a_vencer: retorna TIT-002 e TIT-003', async () => {
            const res = await request(app).get('/v1/financeiro/titulos?doc=12345678000190&status=a_vencer');
            expect(res.status).toBe(200);
            expect(res.body.length).toBeGreaterThanOrEqual(2);
            res.body.forEach((t: any) => expect(t.status).toBe('a_vencer'));
        });

        it('filtra por status=pago: retorna TIT-004', async () => {
            const res = await request(app).get('/v1/financeiro/titulos?doc=12345678000190&status=pago');
            expect(res.status).toBe(200);
            expect(res.body.length).toBe(1);
            expect(res.body[0].id).toBe('TIT-004');
            expect(res.body[0].data_pagamento).toBeDefined();
        });

        it('cliente bloqueado (Pão Quente) tem só títulos vencidos', async () => {
            const res = await request(app).get('/v1/financeiro/titulos?doc=98765432000100');
            expect(res.status).toBe(200);
            expect(res.body.length).toBe(3);
            res.body.forEach((t: any) => expect(t.status).toBe('vencido'));
        });

        it('todos os títulos vencidos do Pão Quente têm juros', async () => {
            const res = await request(app).get('/v1/financeiro/titulos?doc=98765432000100');
            res.body.forEach((t: any) => {
                expect(t.juros_multa).toBeGreaterThan(0);
                expect(t.valor_atualizado).toBeGreaterThan(t.valor_original);
            });
        });

        it('campo obrigatório linha_digitavel presente nos vencidos (API_SPEC)', async () => {
            const res = await request(app).get('/v1/financeiro/titulos?doc=12345678000190&status=vencido');
            expect(res.body[0]).toHaveProperty('linha_digitavel');
            expect(res.body[0].linha_digitavel).not.toBeNull();
        });

        it('retorna array vazio para cliente sem títulos', async () => {
            const res = await request(app).get('/v1/financeiro/titulos?doc=00000000000000');
            expect(res.status).toBe(200);
            expect(res.body).toEqual([]);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // GET /v1/faturamento/pedidos — todos os status do ciclo
    // ─────────────────────────────────────────────────────────────────────────
    describe('GET /v1/faturamento/pedidos', () => {
        it('cliente A tem 5 pedidos cobrindo todos os status', async () => {
            const res = await request(app).get('/v1/faturamento/pedidos?doc=12345678000190');
            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(5);
        });

        it('pedido ENTREGUE tem nfe e rastreio completos', async () => {
            const res = await request(app).get('/v1/faturamento/pedidos?doc=12345678000190&status=entregue');
            expect(res.body.length).toBeGreaterThan(0);
            const ped = res.body[0];
            expect(ped.nfe).toBeDefined();
            expect(ped.nfe.numero).toBeDefined();
            expect(ped.nfe.danfe_url).toBeDefined();
            expect(ped.rastreio).toBeDefined();
            expect(ped.rastreio.codigo).toBeDefined();
        });

        it('pedido EM_TRANSITO tem nfe mas status de rastreio em trânsito', async () => {
            const res = await request(app).get('/v1/faturamento/pedidos?doc=12345678000190&status=em_transito');
            expect(res.body.length).toBeGreaterThan(0);
            const ped = res.body[0];
            expect(ped.nfe).toBeDefined();
            expect(ped.rastreio.status).toContain('trânsito');
        });

        it('pedido FATURADO tem nfe mas sem rastreio ainda', async () => {
            const res = await request(app).get('/v1/faturamento/pedidos?doc=12345678000190&status=faturado');
            expect(res.body.length).toBeGreaterThan(0);
            expect(res.body[0].nfe).toBeDefined();
            expect(res.body[0].rastreio).toBeNull();
        });

        it('pedido AGUARDANDO_FATURAMENTO não tem nfe nem rastreio', async () => {
            const res = await request(app).get('/v1/faturamento/pedidos?doc=12345678000190&status=aguardando_faturamento');
            expect(res.body.length).toBeGreaterThan(0);
            expect(res.body[0].nfe).toBeNull();
            expect(res.body[0].rastreio).toBeNull();
        });

        it('pedido CANCELADO tem motivo de cancelamento', async () => {
            const res = await request(app).get('/v1/faturamento/pedidos?doc=12345678000190&status=cancelado');
            expect(res.body.length).toBeGreaterThan(0);
            expect(res.body[0].motivo_cancelamento).toBeDefined();
        });

        it('pedido contém itens com sku, nome, qtd e valor_unit', async () => {
            const res = await request(app).get('/v1/faturamento/pedidos?doc=12345678000190');
            const ped = res.body[0];
            expect(ped.itens).toBeDefined();
            expect(ped.itens.length).toBeGreaterThan(0);
            expect(ped.itens[0]).toHaveProperty('sku');
            expect(ped.itens[0]).toHaveProperty('nome');
            expect(ped.itens[0]).toHaveProperty('qtd');
            expect(ped.itens[0]).toHaveProperty('valor_unit');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // GET /v1/vendas/estoque — catálogo completo + promoções
    // ─────────────────────────────────────────────────────────────────────────
    describe('GET /v1/vendas/estoque', () => {
        it('retorna catálogo completo (12 produtos)', async () => {
            const res = await request(app).get('/v1/vendas/estoque');
            expect(res.status).toBe(200);
            expect(res.body.length).toBe(12);
        });

        it('produto com preço promocional retorna preco_promocional > 0 (PROD-008)', async () => {
            const res = await request(app).get('/v1/vendas/estoque?busca=PROD-008');
            expect(res.body[0].preco_promocional).not.toBeNull();
            expect(res.body[0].preco_promocional).toBeLessThan(res.body[0].preco_tabela);
        });

        it('PROD-003 (Argamassa AC-III) está sem estoque', async () => {
            const res = await request(app).get('/v1/vendas/estoque?busca=PROD-003');
            expect(res.body[0].estoque_disponivel).toBe(0);
        });

        it('PROD-009 (Cimento CP V) está sem estoque', async () => {
            const res = await request(app).get('/v1/vendas/estoque?busca=PROD-009');
            expect(res.body[0].estoque_disponivel).toBe(0);
        });

        it('filtra por categoria=ferragem retorna 2 produtos', async () => {
            const res = await request(app).get('/v1/vendas/estoque?categoria=ferragem');
            expect(res.body.length).toBe(2);
        });

        it('filtra por categoria=cimento retorna 3 produtos', async () => {
            const res = await request(app).get('/v1/vendas/estoque?categoria=cimento');
            expect(res.body.length).toBe(3);
        });

        it('produto contém campos obrigatórios da API_SPEC (incluindo imagem_url)', async () => {
            const res = await request(app).get('/v1/vendas/estoque?busca=cimento');
            const produto = res.body[0];
            expect(produto).toHaveProperty('sku');
            expect(produto).toHaveProperty('nome');
            expect(produto).toHaveProperty('unidade');
            expect(produto).toHaveProperty('estoque_disponivel');
            expect(produto).toHaveProperty('preco_tabela');
            expect(produto).toHaveProperty('preco_promocional');
            expect(produto).toHaveProperty('imagem_url');
        });

        it('busca por nome parcial (cimento) retorna múltiplos resultados', async () => {
            const res = await request(app).get('/v1/vendas/estoque?busca=cimento');
            expect(res.body.length).toBeGreaterThanOrEqual(2);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // GET /v1/vendas/planos-pagamento (PRD Onda 2)
    // ─────────────────────────────────────────────────────────────────────────
    describe('GET /v1/vendas/planos-pagamento', () => {
        it('retorna todos os planos de pagamento', async () => {
            const res = await request(app).get('/v1/vendas/planos-pagamento');
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBeGreaterThan(0);
        });

        it('plano PIX tem desconto de 5%', async () => {
            const res = await request(app).get('/v1/vendas/planos-pagamento');
            const pix = res.body.find((p: any) => p.codigo === 'pix');
            expect(pix).toBeDefined();
            expect(pix.desconto).toBe(5);
        });

        it('todos os planos têm codigo, descricao, desconto e parcelas', async () => {
            const res = await request(app).get('/v1/vendas/planos-pagamento');
            res.body.forEach((plano: any) => {
                expect(plano).toHaveProperty('codigo');
                expect(plano).toHaveProperty('descricao');
                expect(plano).toHaveProperty('desconto');
                expect(plano).toHaveProperty('parcelas');
            });
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // POST /v1/vendas/pedido
    // ─────────────────────────────────────────────────────────────────────────
    describe('POST /v1/vendas/pedido', () => {
        it('cria pedido com PIX e retorna previsao_faturamento', async () => {
            const res = await request(app)
                .post('/v1/vendas/pedido')
                .send({
                    cliente_id: 'CUST-001',
                    filial_id: 'FIL-01',
                    itens: [{ sku: 'PROD-001', quantidade: 50 }],
                    pagamento: { metodo: 'pix', condicao: 'avista' },
                    observacoes: 'Entrega antecipada se possível',
                });
            expect(res.status).toBe(201);
            expect(res.body.status).toBe('aguardando_analise');
            expect(res.body.pedido_id).toBeDefined();
            expect(res.body.previsao_faturamento).toBeDefined();
        });

        it('cria pedido 30/60/90 dias e retorna mensagem de sucesso', async () => {
            const res = await request(app)
                .post('/v1/vendas/pedido')
                .send({
                    cliente_id: 'CUST-001',
                    filial_id: 'FIL-01',
                    itens: [{ sku: 'PROD-002', quantidade: 5 }],
                    pagamento: { metodo: 'boleto_prazo', condicao: '30_60_90' },
                });
            expect(res.status).toBe(201);
            expect(res.body.mensagem).toContain('Pedido recebido');
            expect(res.body.mensagem).toBeDefined();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // POST /v1/handoff (PRD Onda 1 — Transbordo inteligente)
    // ─────────────────────────────────────────────────────────────────────────
    describe('POST /v1/handoff', () => {
        it('handoff financeiro vai para fila correta', async () => {
            const res = await request(app)
                .post('/v1/handoff')
                .send({ motivo: 'Dúvida financeira sobre boleto', cliente_id: 'CUST-001', conversa_id: 'CONV-123' });
            expect(res.status).toBe(200);
            expect(res.body.ticket_id).toBeDefined();
            expect(res.body.fila).toBe('financeiro');
            expect(res.body.tempo_espera_estimado).toBeDefined();
        });

        it('handoff comercial vai para fila correta', async () => {
            const res = await request(app)
                .post('/v1/handoff')
                .send({ motivo: 'Quero falar com vendedor', cliente_id: 'CUST-001', conversa_id: 'CONV-124' });
            expect(res.status).toBe(200);
            expect(res.body.fila).toBe('comercial');
        });
    });
});
