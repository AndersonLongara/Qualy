// ─────────────────────────────────────────────────────────────────────────────
// Mock data shared between server.ts (runtime) and app.ts (tests).
// Keep this file free of side-effects (no express, no listen).
// ─────────────────────────────────────────────────────────────────────────────

const daysFromNow = (n: number) =>
    new Date(Date.now() + n * 86400000).toISOString().split('T')[0];

// ─────────────────────────────────────────────────────────────────────────────
// 1. CLIENTES — 6 perfis (todos os status)
// ─────────────────────────────────────────────────────────────────────────────
export const CLIENTS: Record<string, any> = {
    '12345678000190': {
        id: 'CUST-001',
        razao_social: 'Mercadinho Exemplo LTDA',
        fantasia: 'Mercadinho do João',
        documento: '12.345.678/0001-90',
        status: 'ativo',
        segmento: 'Varejo Alimentar',
        email: 'financeiro@mercadinhodojoao.com.br',
        telefone: '(11) 94444-5555',
        vendedor: { id: 'V-01', nome: 'Carlos Almeida' },
        filiais: [
            { id: 'FIL-01', nome: 'Matriz — São Paulo (SP)' },
            { id: 'FIL-02', nome: 'Filial — Campinas (SP)' },
            { id: 'FIL-03', nome: 'Filial — Rio de Janeiro (RJ)' },
        ],
    },
    // CNPJ de teste (preview / order flow) — mesmo estilo de mock gerenciado pela plataforma
    '12345678000195': {
        id: 'CUST-TEST',
        razao_social: 'Cliente Teste LTDA',
        fantasia: 'Cliente Teste',
        documento: '12.345.678/0001-95',
        status: 'ativo',
        segmento: 'Varejo',
        email: 'teste@qualy.com.br',
        telefone: '(11) 99999-0000',
        vendedor: { id: 'V-01', nome: 'Carlos Almeida' },
        filiais: [{ id: 'FIL-01', nome: 'Matriz' }],
    },
    '98765432000100': {
        id: 'CUST-002',
        razao_social: 'Padaria da Esquina EIRELI',
        fantasia: 'Pão Quente',
        documento: '98.765.432/0001-00',
        status: 'bloqueado',
        motivo_bloqueio: 'Inadimplência — títulos vencidos há mais de 30 dias',
        segmento: 'Alimentação',
        email: 'contato@paoquente.com.br',
        telefone: '(11) 93333-7777',
        vendedor: { id: 'V-02', nome: 'Ana Paula Santos' },
        filiais: [{ id: 'FIL-01', nome: 'Matriz — São Paulo (SP)' }],
    },
    '11122233000144': {
        id: 'CUST-003',
        razao_social: 'Construções Silva ME',
        fantasia: 'Silva Materiais',
        documento: '111.222.33/0001-44',
        status: 'inativo',
        motivo_bloqueio: 'Inatividade superior a 180 dias',
        segmento: 'Construção Civil',
        email: 'compras@silvamateriais.com.br',
        telefone: '(21) 98888-1234',
        vendedor: { id: 'V-03', nome: 'Roberto Costa' },
        filiais: [{ id: 'FIL-01', nome: 'Matriz — Niterói (RJ)' }],
    },
    '55566677000188': {
        id: 'CUST-004',
        razao_social: 'Construtora Horizonte S.A.',
        fantasia: 'Horizonte Engenharia',
        documento: '555.666.77/0001-88',
        status: 'ativo',
        segmento: 'Construção Civil',
        email: 'compras@horizonteeng.com.br',
        telefone: '(11) 2222-3333',
        vendedor: { id: 'V-01', nome: 'Carlos Almeida' },
        filiais: [
            { id: 'FIL-01', nome: 'Matriz — São Paulo (SP)' },
            { id: 'FIL-02', nome: 'Filial — Guarulhos (SP)' },
        ],
    },
    '52998224725': {
        id: 'CUST-005',
        razao_social: 'José Ferreira da Silva',
        fantasia: 'José F. Silva',
        documento: '529.982.247-25',
        status: 'ativo',
        segmento: 'Pessoa Física',
        email: 'jose.fsilva@email.com',
        telefone: '(19) 99111-2222',
        vendedor: { id: 'V-02', nome: 'Ana Paula Santos' },
        filiais: [{ id: 'FIL-01', nome: 'Entrega Única' }],
    },
    '33344455000166': {
        id: 'CUST-006',
        razao_social: 'Depósito Central LTDA',
        fantasia: 'Depósito Central',
        documento: '333.444.55/0001-66',
        status: 'bloqueado',
        motivo_bloqueio: 'Limite de crédito excedido',
        segmento: 'Atacado',
        email: 'financeiro@deposito-central.com.br',
        telefone: '(11) 5555-6666',
        vendedor: { id: 'V-03', nome: 'Roberto Costa' },
        filiais: [{ id: 'FIL-01', nome: 'Matriz — Osasco (SP)' }],
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. TÍTULOS — ciclo completo (vencido+juros, a_vencer, pago)
// ─────────────────────────────────────────────────────────────────────────────
export const TITULOS: Record<string, any[]> = {
    '12345678000190': [
        {
            id: 'TIT-001', numero_nota: '102030',
            valor_original: 1500.00, valor_atualizado: 1578.23, juros_multa: 78.23,
            vencimento: daysFromNow(-15), status: 'vencido',
            pdf_url: 'https://example.com/boleto-102030.pdf',
            linha_digitavel: '23793.38128 60033.045209 76000.063300 1 894500000157823',
        },
        {
            id: 'TIT-002', numero_nota: '102031',
            valor_original: 2000.00, valor_atualizado: 2000.00, juros_multa: 0,
            vencimento: daysFromNow(3), status: 'a_vencer',
            pdf_url: 'https://example.com/boleto-102031.pdf',
            linha_digitavel: '23793.38128 60033.045209 76000.063300 1 894500000200000',
        },
        {
            id: 'TIT-003', numero_nota: '102032',
            valor_original: 750.00, valor_atualizado: 750.00, juros_multa: 0,
            vencimento: daysFromNow(18), status: 'a_vencer',
            pdf_url: 'https://example.com/boleto-102032.pdf',
            linha_digitavel: '23793.38128 60033.045209 76000.063300 1 894500000075000',
        },
        {
            id: 'TIT-004', numero_nota: '102015',
            valor_original: 3200.00, valor_atualizado: 3200.00, juros_multa: 0,
            vencimento: daysFromNow(-45), status: 'pago',
            data_pagamento: daysFromNow(-44),
            pdf_url: 'https://example.com/boleto-102015.pdf',
            linha_digitavel: null,
        },
    ],
    '98765432000100': [
        {
            id: 'TIT-101', numero_nota: '200010',
            valor_original: 5000.00, valor_atualizado: 5450.00, juros_multa: 450.00,
            vencimento: daysFromNow(-35), status: 'vencido',
            pdf_url: 'https://example.com/boleto-200010.pdf',
            linha_digitavel: '23793.38128 60033.045209 76000.063300 1 894500000545000',
        },
        {
            id: 'TIT-102', numero_nota: '200011',
            valor_original: 3200.00, valor_atualizado: 3384.00, juros_multa: 184.00,
            vencimento: daysFromNow(-31), status: 'vencido',
            pdf_url: 'https://example.com/boleto-200011.pdf',
            linha_digitavel: '23793.38128 60033.045209 76000.063300 1 894500000338400',
        },
        {
            id: 'TIT-103', numero_nota: '200012',
            valor_original: 1800.00, valor_atualizado: 1854.00, juros_multa: 54.00,
            vencimento: daysFromNow(-32), status: 'vencido',
            pdf_url: 'https://example.com/boleto-200012.pdf',
            linha_digitavel: '23793.38128 60033.045209 76000.063300 1 894500000185400',
        },
    ],
    '55566677000188': [
        {
            id: 'TIT-401', numero_nota: '300100',
            valor_original: 45000.00, valor_atualizado: 45000.00, juros_multa: 0,
            vencimento: daysFromNow(7), status: 'a_vencer',
            pdf_url: 'https://example.com/boleto-300100.pdf',
            linha_digitavel: '23793.38128 60033.045209 76000.063300 1 894500004500000',
        },
        {
            id: 'TIT-402', numero_nota: '300101',
            valor_original: 38000.00, valor_atualizado: 38000.00, juros_multa: 0,
            vencimento: daysFromNow(14), status: 'a_vencer',
            pdf_url: 'https://example.com/boleto-300101.pdf',
            linha_digitavel: '23793.38128 60033.045209 76000.063300 1 894500003800000',
        },
        {
            id: 'TIT-403', numero_nota: '300085',
            valor_original: 22000.00, valor_atualizado: 22000.00, juros_multa: 0,
            vencimento: daysFromNow(-60), status: 'pago',
            data_pagamento: daysFromNow(-59),
            pdf_url: null, linha_digitavel: null,
        },
    ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. PEDIDOS — todos os status do ciclo de vida
// ─────────────────────────────────────────────────────────────────────────────
export const PEDIDOS: Record<string, any[]> = {
    '12345678000190': [
        {
            id: 'PED-001', data: daysFromNow(-5), valor_total: 4500.00, status: 'entregue',
            itens: [
                { sku: 'PROD-001', nome: 'Cimento CP II 50kg', qtd: 100, valor_unit: 29.90 },
                { sku: 'PROD-005', nome: 'Cal Hidratada CH III 20kg', qtd: 50, valor_unit: 18.00 },
            ],
            nfe: {
                numero: '998877', chave: '35241112345678000190550010009988771000012345',
                xml_url: 'https://example.com/nfe-998877.xml',
                danfe_url: 'https://example.com/nfe-998877.pdf',
            },
            rastreio: { transportadora: 'TransAltra', codigo: 'TRK-001', status: 'Entregue com sucesso' },
        },
        {
            id: 'PED-002', data: daysFromNow(-2), valor_total: 1185.00, status: 'em_transito',
            itens: [
                { sku: 'PROD-004', nome: 'Tela Soldada Q138 (2x3m)', qtd: 15, valor_unit: 78.90 },
            ],
            nfe: {
                numero: '998878', chave: '35241112345678000190550010009988781000012346',
                xml_url: 'https://example.com/nfe-998878.xml',
                danfe_url: 'https://example.com/nfe-998878.pdf',
            },
            rastreio: { transportadora: 'Correios', codigo: 'OJ123456789BR', status: 'Em trânsito — saiu de SP para RJ' },
        },
        {
            id: 'PED-003', data: daysFromNow(-1), valor_total: 8500.00, status: 'faturado',
            itens: [
                { sku: 'PROD-002', nome: 'Tijolo Baiano 8 Furos (Milheiro)', qtd: 9, valor_unit: 850.00 },
                { sku: 'PROD-006', nome: 'Areia Média Lavada (m³)', qtd: 10, valor_unit: 85.00 },
            ],
            nfe: {
                numero: '998900', chave: '35241112345678000190550010009989001000012347',
                xml_url: 'https://example.com/nfe-998900.xml',
                danfe_url: 'https://example.com/nfe-998900.pdf',
            },
            rastreio: null,
        },
        {
            id: 'PED-004', data: daysFromNow(0), valor_total: 2990.00, status: 'aguardando_faturamento',
            itens: [
                { sku: 'PROD-001', nome: 'Cimento CP II 50kg', qtd: 100, valor_unit: 29.90 },
            ],
            nfe: null, rastreio: null,
        },
        {
            id: 'PED-005', data: daysFromNow(-3), valor_total: 5670.00, status: 'cancelado',
            motivo_cancelamento: 'Solicitação do cliente — produto substituto',
            itens: [
                { sku: 'PROD-001', nome: 'Cimento CP II 50kg', qtd: 100, valor_unit: 29.90 },
                { sku: 'PROD-003', nome: 'Argamassa AC-III 20kg', qtd: 40, valor_unit: 35.50 },
            ],
            nfe: null, rastreio: null,
        },
    ],
    '55566677000188': [
        {
            id: 'PED-601', data: daysFromNow(-10), valor_total: 125000.00, status: 'entregue',
            itens: [
                { sku: 'PROD-001', nome: 'Cimento CP II 50kg', qtd: 3000, valor_unit: 29.90 },
                { sku: 'PROD-002', nome: 'Tijolo Baiano 8 Furos (Milheiro)', qtd: 50, valor_unit: 850.00 },
            ],
            nfe: {
                numero: '998950', chave: '35241155566677000188550010009989501000012500',
                xml_url: 'https://example.com/nfe-998950.xml',
                danfe_url: 'https://example.com/nfe-998950.pdf',
            },
            rastreio: { transportadora: 'TransAltra', codigo: 'TRK-100', status: 'Entregue' },
        },
        {
            id: 'PED-602', data: daysFromNow(-1), valor_total: 85000.00, status: 'em_transito',
            itens: [
                { sku: 'PROD-001', nome: 'Cimento CP II 50kg', qtd: 2000, valor_unit: 29.90 },
                { sku: 'PROD-007', nome: 'Brita 1 (m³)', qtd: 30, valor_unit: 120.00 },
            ],
            nfe: {
                numero: '999000', chave: '35241155566677000188550010009990001000012600',
                xml_url: 'https://example.com/nfe-999000.xml',
                danfe_url: 'https://example.com/nfe-999000.pdf',
            },
            rastreio: { transportadora: 'TransAltra', codigo: 'TRK-101', status: 'Em rota de entrega' },
        },
    ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. CATÁLOGO — 12 produtos, 6 categorias, promoções, sem estoque
// ─────────────────────────────────────────────────────────────────────────────
export const ESTOQUE = [
    { sku: 'PROD-001', nome: 'Cimento CP II 50kg', categoria: 'Cimento', unidade: 'SC', estoque_disponivel: 500, preco_tabela: 29.90, preco_promocional: null, imagem_url: 'https://example.com/img/cimento-cpii.jpg' },
    { sku: 'PROD-008', nome: 'Cimento CP IV 50kg (Baixo Calor)', categoria: 'Cimento', unidade: 'SC', estoque_disponivel: 80, preco_tabela: 33.50, preco_promocional: 31.00, imagem_url: 'https://example.com/img/cimento-cpiv.jpg' },
    { sku: 'PROD-009', nome: 'Cimento CP V ARI 50kg', categoria: 'Cimento', unidade: 'SC', estoque_disponivel: 0, preco_tabela: 36.00, preco_promocional: null, imagem_url: 'https://example.com/img/cimento-cpv.jpg' },
    { sku: 'PROD-002', nome: 'Tijolo Baiano 8 Furos (Milheiro)', categoria: 'Alvenaria', unidade: 'MIL', estoque_disponivel: 50, preco_tabela: 850.00, preco_promocional: 790.00, imagem_url: 'https://example.com/img/tijolo.jpg' },
    { sku: 'PROD-010', nome: 'Bloco Concreto 14x19x39', categoria: 'Alvenaria', unidade: 'PC', estoque_disponivel: 2000, preco_tabela: 4.80, preco_promocional: null, imagem_url: 'https://example.com/img/bloco.jpg' },
    { sku: 'PROD-003', nome: 'Argamassa AC-III 20kg', categoria: 'Argamassa', unidade: 'SC', estoque_disponivel: 0, preco_tabela: 35.50, preco_promocional: null, imagem_url: 'https://example.com/img/argamassa.jpg' },
    { sku: 'PROD-011', nome: 'Argamassa Colante AC-I 20kg', categoria: 'Argamassa', unidade: 'SC', estoque_disponivel: 350, preco_tabela: 22.00, preco_promocional: null, imagem_url: 'https://example.com/img/argamassa-aci.jpg' },
    { sku: 'PROD-004', nome: 'Tela Soldada Q138 (2x3m)', categoria: 'Ferragem', unidade: 'PC', estoque_disponivel: 120, preco_tabela: 78.90, preco_promocional: 72.00, imagem_url: 'https://example.com/img/tela-soldada.jpg' },
    { sku: 'PROD-012', nome: 'Ferro CA-50 10mm (Barra 12m)', categoria: 'Ferragem', unidade: 'PC', estoque_disponivel: 800, preco_tabela: 52.00, preco_promocional: null, imagem_url: 'https://example.com/img/ferro-ca50.jpg' },
    { sku: 'PROD-005', nome: 'Cal Hidratada CH III 20kg', categoria: 'Cal', unidade: 'SC', estoque_disponivel: 300, preco_tabela: 18.00, preco_promocional: null, imagem_url: 'https://example.com/img/cal.jpg' },
    { sku: 'PROD-006', nome: 'Areia Média Lavada (m³)', categoria: 'Agregado', unidade: 'M3', estoque_disponivel: 200, preco_tabela: 85.00, preco_promocional: null, imagem_url: 'https://example.com/img/areia.jpg' },
    { sku: 'PROD-007', nome: 'Brita 1 (m³)', categoria: 'Agregado', unidade: 'M3', estoque_disponivel: 150, preco_tabela: 120.00, preco_promocional: null, imagem_url: 'https://example.com/img/brita.jpg' },
];

// ─────────────────────────────────────────────────────────────────────────────
// 5. PLANOS DE PAGAMENTO (PRD Onda 2)
// ─────────────────────────────────────────────────────────────────────────────
export const PLANOS_PAGAMENTO = [
    { codigo: 'pix', descricao: 'PIX à Vista', desconto: 5, parcelas: 1 },
    { codigo: 'boleto_avista', descricao: 'Boleto à Vista', desconto: 2, parcelas: 1 },
    { codigo: '30', descricao: 'Boleto 30 dias', desconto: 0, parcelas: 1 },
    { codigo: '30_60', descricao: 'Boleto 30/60 dias', desconto: 0, parcelas: 2 },
    { codigo: '30_60_90', descricao: 'Boleto 30/60/90 dias', desconto: 0, parcelas: 3 },
    { codigo: 'cartao', descricao: 'Cartão de Crédito', desconto: 0, parcelas: 1 },
];
