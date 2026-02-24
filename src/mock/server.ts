import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { getConfig, getAssistantConfig, TenantNotFoundError } from '../config/tenant';
import { processChatMessage } from '../core/chat/processChat';
import { executionStore } from './executionStore';
import { usageStore } from './usageStore';
import { adminRouter } from './adminRouter';
import { listAllTenantIds, ensureTenantLoaded } from './tenantStorage';

dotenv.config({ path: '.env.local' });
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const daysFromNow = (n: number) =>
    new Date(Date.now() + n * 86400000).toISOString().split('T')[0];

// ─────────────────────────────────────────────────────────────────────────────
// 1. CLIENTES — cobre todos os status possíveis (API_SPEC + PRD Onda 1)
// ─────────────────────────────────────────────────────────────────────────────
export const CLIENTS: Record<string, any> = {
    // ✅ Ativo — caminho feliz completo
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

    // ✅ Ativo — CNPJ usado em testes (preview/order flow)
    '12345678000195': {
        id: 'CUST-TEST',
        razao_social: 'Cliente Teste LTDA',
        fantasia: 'Cliente Teste',
        documento: '12.345.678/0001-95',
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

    // 🔴 Bloqueado — inadimplência
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

    // ⚫ Inativo — sem atividade > 180 dias
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

    // ✅ Ativo — grande conta, múltiplos pedidos e títulos
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

    // ✅ Ativo — cliente PF (CPF)
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

    // 🔴 Bloqueado — limite de crédito excedido
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
// 2. TÍTULOS FINANCEIROS — todos os status + cenários críticos (PRD Onda 1)
// ─────────────────────────────────────────────────────────────────────────────
export const TITULOS: Record<string, any[]> = {

    // Cliente A — mix de vencidos, a vencer e pago
    '12345678000190': [
        {
            id: 'TIT-001', numero_nota: '102030',
            valor_original: 1500.00, valor_atualizado: 1578.23, // já tem juros/multa
            juros_multa: 78.23,
            vencimento: daysFromNow(-15), status: 'vencido',
            pdf_url: 'https://example.com/boleto-102030.pdf',
            linha_digitavel: '23793.38128 60033.045209 76000.063300 1 894500000157823',
        },
        {
            id: 'TIT-002', numero_nota: '102031',
            valor_original: 2000.00, valor_atualizado: 2000.00,
            juros_multa: 0,
            vencimento: daysFromNow(3), status: 'a_vencer',
            pdf_url: 'https://example.com/boleto-102031.pdf',
            linha_digitavel: '23793.38128 60033.045209 76000.063300 1 894500000200000',
        },
        {
            id: 'TIT-003', numero_nota: '102032',
            valor_original: 750.00, valor_atualizado: 750.00,
            juros_multa: 0,
            vencimento: daysFromNow(18), status: 'a_vencer',
            pdf_url: 'https://example.com/boleto-102032.pdf',
            linha_digitavel: '23793.38128 60033.045209 76000.063300 1 894500000075000',
        },
        {
            id: 'TIT-004', numero_nota: '102015',
            valor_original: 3200.00, valor_atualizado: 3200.00,
            juros_multa: 0,
            vencimento: daysFromNow(-45), status: 'pago',
            data_pagamento: daysFromNow(-44),
            pdf_url: 'https://example.com/boleto-102015.pdf',
            linha_digitavel: null,
        },
    ],

    // Cliente B (Bloqueado) — só títulos vencidos (motivo do bloqueio)
    '98765432000100': [
        {
            id: 'TIT-101', numero_nota: '200010',
            valor_original: 5000.00, valor_atualizado: 5450.00,
            juros_multa: 450.00,
            vencimento: daysFromNow(-35), status: 'vencido',
            pdf_url: 'https://example.com/boleto-200010.pdf',
            linha_digitavel: '23793.38128 60033.045209 76000.063300 1 894500000545000',
        },
        {
            id: 'TIT-102', numero_nota: '200011',
            valor_original: 3200.00, valor_atualizado: 3384.00,
            juros_multa: 184.00,
            vencimento: daysFromNow(-31), status: 'vencido',
            pdf_url: 'https://example.com/boleto-200011.pdf',
            linha_digitavel: '23793.38128 60033.045209 76000.063300 1 894500000338400',
        },
        {
            id: 'TIT-103', numero_nota: '200012',
            valor_original: 1800.00, valor_atualizado: 1854.00,
            juros_multa: 54.00,
            vencimento: daysFromNow(-32), status: 'vencido',
            pdf_url: 'https://example.com/boleto-200012.pdf',
            linha_digitavel: '23793.38128 60033.045209 76000.063300 1 894500000185400',
        },
    ],

    // Cliente Grande — alta volumetria
    '55566677000188': [
        {
            id: 'TIT-401', numero_nota: '300100',
            valor_original: 45000.00, valor_atualizado: 45000.00,
            juros_multa: 0,
            vencimento: daysFromNow(7), status: 'a_vencer',
            pdf_url: 'https://example.com/boleto-300100.pdf',
            linha_digitavel: '23793.38128 60033.045209 76000.063300 1 894500004500000',
        },
        {
            id: 'TIT-402', numero_nota: '300101',
            valor_original: 38000.00, valor_atualizado: 38000.00,
            juros_multa: 0,
            vencimento: daysFromNow(14), status: 'a_vencer',
            pdf_url: 'https://example.com/boleto-300101.pdf',
            linha_digitavel: '23793.38128 60033.045209 76000.063300 1 894500003800000',
        },
        {
            id: 'TIT-403', numero_nota: '300085',
            valor_original: 22000.00, valor_atualizado: 22000.00,
            juros_multa: 0,
            vencimento: daysFromNow(-60), status: 'pago',
            data_pagamento: daysFromNow(-59),
            pdf_url: null,
            linha_digitavel: null,
        },
    ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. PEDIDOS / FATURAMENTO — todos os status do ciclo de vida (PRD Onda 1 + 2)
// ─────────────────────────────────────────────────────────────────────────────
export const PEDIDOS: Record<string, any[]> = {

    // Cliente A — todos os status do ciclo de vida
    '12345678000190': [
        {
            id: 'PED-001', data: daysFromNow(-5), valor_total: 4500.00,
            status: 'entregue',
            itens: [
                { sku: 'PROD-001', nome: 'Cimento CP II 50kg', qtd: 100, valor_unit: 29.90 },
                { sku: 'PROD-005', nome: 'Cal Hidratada CH III 20kg', qtd: 50, valor_unit: 18.00 },
            ],
            nfe: {
                numero: '998877', chave: '35241112345678000190550010009988771000012345',
                xml_url: 'https://example.com/nfe-998877.xml',
                danfe_url: 'https://example.com/nfe-998877.pdf',
            },
            rastreio: { transportadora: 'TransAltra', codigo: 'TRK-001', status: 'Entregue em ' + daysFromNow(-3) },
        },
        {
            id: 'PED-002', data: daysFromNow(-2), valor_total: 1185.00,
            status: 'em_transito',
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
            id: 'PED-003', data: daysFromNow(-1), valor_total: 8500.00,
            status: 'faturado',
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
            id: 'PED-004', data: daysFromNow(0), valor_total: 2990.00,
            status: 'aguardando_faturamento',
            itens: [
                { sku: 'PROD-001', nome: 'Cimento CP II 50kg', qtd: 100, valor_unit: 29.90 },
            ],
            nfe: null, rastreio: null,
        },
        {
            id: 'PED-005', data: daysFromNow(-3), valor_total: 5670.00,
            status: 'cancelado',
            motivo_cancelamento: 'Solicitação do cliente — produto substituto',
            itens: [
                { sku: 'PROD-001', nome: 'Cimento CP II 50kg', qtd: 100, valor_unit: 29.90 },
                { sku: 'PROD-003', nome: 'Argamassa AC-III 20kg', qtd: 40, valor_unit: 35.50 },
            ],
            nfe: null, rastreio: null,
        },
    ],

    // Cliente Grande — alta volumetria
    '55566677000188': [
        {
            id: 'PED-601', data: daysFromNow(-10), valor_total: 125000.00,
            status: 'entregue',
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
            id: 'PED-602', data: daysFromNow(-1), valor_total: 85000.00,
            status: 'em_transito',
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
// 4. CATÁLOGO / ESTOQUE — PRD Onda 2 + preço promocional + múltiplas categorias
// ─────────────────────────────────────────────────────────────────────────────
export const ESTOQUE = [
    // Cimentos
    { sku: 'PROD-001', nome: 'Cimento CP II 50kg', categoria: 'Cimento', unidade: 'SC', estoque_disponivel: 500, preco_tabela: 29.90, preco_promocional: null, imagem_url: 'https://example.com/img/cimento-cpii.jpg' },
    { sku: 'CIM-001', nome: 'Cimento CP-II 50kg', categoria: 'Cimento', unidade: 'SC', estoque_disponivel: 500, preco_tabela: 42.00, preco_promocional: 38.00, imagem_url: 'https://example.com/img/cimento-cpii.jpg' },
    { sku: 'PROD-008', nome: 'Cimento CP IV 50kg (Baixo Calor)', categoria: 'Cimento', unidade: 'SC', estoque_disponivel: 80, preco_tabela: 33.50, preco_promocional: 31.00, imagem_url: 'https://example.com/img/cimento-cpiv.jpg' },
    { sku: 'PROD-009', nome: 'Cimento CP V ARI 50kg', categoria: 'Cimento', unidade: 'SC', estoque_disponivel: 0, preco_tabela: 36.00, preco_promocional: null, imagem_url: 'https://example.com/img/cimento-cpv.jpg' },
    // Alvenaria
    { sku: 'PROD-002', nome: 'Tijolo Baiano 8 Furos (Milheiro)', categoria: 'Alvenaria', unidade: 'MIL', estoque_disponivel: 50, preco_tabela: 850.00, preco_promocional: 790.00, imagem_url: 'https://example.com/img/tijolo.jpg' },
    { sku: 'PROD-010', nome: 'Bloco Concreto 14x19x39', categoria: 'Alvenaria', unidade: 'PC', estoque_disponivel: 2000, preco_tabela: 4.80, preco_promocional: null, imagem_url: 'https://example.com/img/bloco.jpg' },
    // Argamassas
    { sku: 'PROD-003', nome: 'Argamassa AC-III 20kg', categoria: 'Argamassa', unidade: 'SC', estoque_disponivel: 0, preco_tabela: 35.50, preco_promocional: null, imagem_url: 'https://example.com/img/argamassa.jpg' },
    { sku: 'PROD-011', nome: 'Argamassa Colante AC-I 20kg', categoria: 'Argamassa', unidade: 'SC', estoque_disponivel: 350, preco_tabela: 22.00, preco_promocional: null, imagem_url: 'https://example.com/img/argamassa-aci.jpg' },
    // Ferragens
    { sku: 'PROD-004', nome: 'Tela Soldada Q138 (2x3m)', categoria: 'Ferragem', unidade: 'PC', estoque_disponivel: 120, preco_tabela: 78.90, preco_promocional: 72.00, imagem_url: 'https://example.com/img/tela-soldada.jpg' },
    { sku: 'PROD-012', nome: 'Ferro CA-50 10mm (Barra 12m)', categoria: 'Ferragem', unidade: 'PC', estoque_disponivel: 800, preco_tabela: 52.00, preco_promocional: null, imagem_url: 'https://example.com/img/ferro-ca50.jpg' },
    // Agregados
    { sku: 'PROD-005', nome: 'Cal Hidratada CH III 20kg', categoria: 'Cal', unidade: 'SC', estoque_disponivel: 300, preco_tabela: 18.00, preco_promocional: null, imagem_url: 'https://example.com/img/cal.jpg' },
    { sku: 'PROD-006', nome: 'Areia Média Lavada (m³)', categoria: 'Agregado', unidade: 'M3', estoque_disponivel: 200, preco_tabela: 85.00, preco_promocional: null, imagem_url: 'https://example.com/img/areia.jpg' },
    { sku: 'ARE-002', nome: 'Areia Grossa Saca 30kg', categoria: 'Agregado', unidade: 'SC', estoque_disponivel: 120, preco_tabela: 18.50, preco_promocional: null, imagem_url: 'https://example.com/img/areia-grossa.jpg' },
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

// ─────────────────────────────────────────────────────────────────────────────
// API MOCK /v1 — rotas em módulo separado (ver v1Router.ts)
// ─────────────────────────────────────────────────────────────────────────────
import { createV1Router } from './v1Router';
const v1Router = createV1Router({
    clients: CLIENTS,
    titulos: TITULOS,
    pedidos: PEDIDOS,
    estoque: ESTOQUE,
    planosPagamento: PLANOS_PAGAMENTO,
    daysFromNow,
});
app.use('/v1', v1Router);
app.use('/api/v1', v1Router);

// ─────────────────────────────────────────────────────────────────────────────
// TENANTS — lista para o seletor de empresa (sem auth)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/tenants', async (_req: Request, res: Response) => {
    try {
        const ids = await listAllTenantIds();
        const tenants = await Promise.all(ids.map(async (id) => {
            try {
                await ensureTenantLoaded(id);
                const config = getConfig(id);
                return { id, companyName: config.branding.companyName || id };
            } catch {
                return { id, companyName: id };
            }
        }));
        return res.json({ tenants });
    } catch (err: any) {
        console.error('[api/tenants]', err);
        return res.status(500).json({ error: err?.message || 'Erro ao listar empresas.' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — CRUD de tenants e agentes (protegido por X-Admin-Key)
// ─────────────────────────────────────────────────────────────────────────────
app.use('/api/admin', adminRouter);

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG — para o simulador exibir nome/saudação (C8)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/config', async (req: Request, res: Response) => {
    const tenantId = (req.headers['x-tenant-id'] as string)?.trim() || (req.query.tenant as string)?.trim() || 'default';
    const assistantId = (req.headers['x-assistant-id'] as string)?.trim() || (req.query.assistant as string)?.trim() || undefined;
    const baseUrl = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host') || 'localhost:3001'}`).replace(/\/$/, '');
    const webhookUrl = `${baseUrl}/webhook/messages/${encodeURIComponent(tenantId)}`;
    const webhookSecretConfigured = !!(process.env.SOUCHAT_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET);
    try {
        await ensureTenantLoaded(tenantId);
        const config = getConfig(tenantId);
        const assistant = getAssistantConfig(tenantId, assistantId);
        const assistantName = assistant.name || 'AltraFlow';
        const companyName = config.branding.companyName || 'AltraFlow';
        const template = (config.prompt.greeting && config.prompt.greeting.trim()) || 'Olá! Sou a {{assistantName}}, assistente virtual. Como posso ajudar hoje?';
        const greeting = template
            .replace(/\{\{assistantName\}\}/g, assistantName)
            .replace(/\{\{companyName\}\}/g, companyName);

        const entryAgentId = config.chatFlow?.entryAgentId || null;
        const humanEscalation = config.chatFlow?.humanEscalation || null;
        const assistants = (config.assistants || []).map((a) => ({ id: a.id, name: a.name }));

        return res.json({ assistantName, companyName, greeting, webhookUrl, webhookSecretConfigured, entryAgentId, humanEscalation, assistants });
    } catch (err: any) {
        if (err?.name === 'TenantNotFoundError') {
            return res.status(404).json({ error: 'Tenant não encontrado', code: 'TENANT_NOT_FOUND' });
        }
        return res.json({
            assistantName: 'AltraFlow',
            companyName: 'AltraFlow',
            greeting: 'Olá! Sou a AltraFlow, assistente virtual. Como posso ajudar hoje?',
            webhookUrl,
            webhookSecretConfigured,
            entryAgentId: null,
            humanEscalation: null,
            assistants: [],
        });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// CHAT — delega para processChatMessage (C13); usado por /api/chat e webhook
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/chat', async (req: Request, res: Response) => {
    const tenantId = (req.headers['x-tenant-id'] as string)?.trim() || (req.query.tenant as string)?.trim() || 'default';
    const assistantId = (req.headers['x-assistant-id'] as string)?.trim() || (req.query.assistant as string)?.trim() || (req.body?.assistantId ?? req.body?.assistant_id)?.trim() || undefined;
    const { message, history: frontendHistory, phone = 'default' } = req.body;
    const startTime = Date.now();
    try {
        await ensureTenantLoaded(tenantId);
        const { reply, debug, handoff, humanEscalation, effectiveAssistantId } = await processChatMessage(tenantId, phone, message, frontendHistory, assistantId);
        const durationMs = Date.now() - startTime;
        const effectiveId = effectiveAssistantId ?? assistantId;
        let model: string | null = null;
        let temperature: number | null = null;
        try {
            const assistant = getAssistantConfig(tenantId, effectiveId);
            model = (assistant.model && assistant.model.trim()) || null;
            temperature = typeof assistant.temperature === 'number' && !Number.isNaN(assistant.temperature)
                ? assistant.temperature
                : null;
        } catch {
            /* ignore */
        }
        const debugExtra = {
            ...(debug && typeof debug === 'object' && !Array.isArray(debug) ? (debug as Record<string, unknown>) : {}),
            ...(handoff ? { handoff } : {}),
            ...(humanEscalation ? { humanEscalation } : {}),
        };
        await executionStore.add({
            tenantId,
            assistantId: effectiveId ?? null,
            phone,
            message,
            reply,
            status: 'ok',
            durationMs,
            source: 'api',
            debug: Object.keys(debugExtra).length > 0 ? debugExtra : debug,
            model,
            temperature,
        });
        res.json({ reply, debug, handoff: handoff ?? null, humanEscalation: humanEscalation ?? null, effectiveAssistantId: effectiveId ?? null });
    } catch (error: any) {
        if (error?.name === 'TenantNotFoundError') {
            return res.status(404).json({ error: 'Tenant não encontrado', code: 'TENANT_NOT_FOUND' });
        }
        console.error('[CHAT] Erro:', error);
        const durationMs = Date.now() - startTime;
        const errorReply = 'Desculpe, tive um erro interno. Tente novamente.';
        await executionStore.add({
            tenantId,
            assistantId: assistantId ?? null,
            phone,
            message,
            reply: errorReply,
            status: 'error',
            durationMs,
            source: 'api',
        });
        res.status(500).json({ reply: errorReply });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOK — API de mensageria (WhatsApp etc.) — C12
// URL personalizada por empresa: POST /webhook/messages/:tenantId
// Contrato: { phone: string, message: string } (tenant vem da URL)
// Também aceita POST /webhook/messages com tenant_id no body (retrocompat).
// Resposta: { reply: string }
// ─────────────────────────────────────────────────────────────────────────────

function getWebhookDebugHeaders(req: Request): Record<string, string | undefined> {
    return {
        'content-type': req.get('content-type') || undefined,
        'user-agent': req.get('user-agent') || undefined,
        'x-webhook-signature': req.get('x-webhook-signature') || undefined,
        'x-signature': req.get('x-signature') || undefined,
    };
}

async function handleWebhookMessage(req: Request, res: Response, tenantId: string) {
    const body = req.body;
    const assistantId = (body?.assistant_id ?? body?.assistantId)?.trim() || undefined;
    const phone = body?.phone ?? body?.from ?? body?.sender_id;
    const message = body?.message ?? body?.text ?? body?.content;
    const safePhone = typeof phone === 'string' ? phone : '(payload-sem-phone)';
    const safeMessage = typeof message === 'string' ? message : JSON.stringify(body ?? {});
    const baseDebug = {
        kind: 'webhook',
        request: {
            tenantId,
            assistantId: assistantId ?? null,
            receivedAt: new Date().toISOString(),
            headers: getWebhookDebugHeaders(req),
            body,
        },
    };

    if (!phone || typeof phone !== 'string' || !message || typeof message !== 'string') {
        await executionStore.add({
            tenantId,
            phone: safePhone,
            message: safeMessage,
            reply: 'Payload inválido',
            status: 'error',
            durationMs: 0,
            source: 'webhook',
            debug: {
                ...baseDebug,
                response: {
                    status: 400,
                    body: {
                        error: 'Payload inválido',
                        message: 'Campos obrigatórios: phone (ou from/sender_id), message (ou text/content).',
                    },
                },
            },
        });
        return res.status(400).json({
            error: 'Payload inválido',
            message: 'Campos obrigatórios: phone (ou from/sender_id), message (ou text/content).',
        });
    }

    const webhookSecret = process.env.SOUCHAT_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET;
    if (webhookSecret && typeof webhookSecret === 'string') {
        const signature = req.headers['x-webhook-signature'] || req.headers['x-signature'];
        if (!signature) {
            await executionStore.add({
                tenantId,
                phone: safePhone,
                message: safeMessage,
                reply: 'Assinatura do webhook ausente.',
                status: 'error',
                durationMs: 0,
                source: 'webhook',
                debug: {
                    ...baseDebug,
                    response: { status: 401, body: { error: 'Assinatura do webhook ausente.' } },
                },
            });
            return res.status(401).json({ error: 'Assinatura do webhook ausente.' });
        }
        if (String(signature).trim() === '') {
            await executionStore.add({
                tenantId,
                phone: safePhone,
                message: safeMessage,
                reply: 'Assinatura do webhook inválida.',
                status: 'error',
                durationMs: 0,
                source: 'webhook',
                debug: {
                    ...baseDebug,
                    response: { status: 401, body: { error: 'Assinatura do webhook inválida.' } },
                },
            });
            return res.status(401).json({ error: 'Assinatura do webhook inválida.' });
        }
    }

    const startTime = Date.now();
    try {
        await ensureTenantLoaded(tenantId);
        const { reply, debug, handoff, effectiveAssistantId } = await processChatMessage(tenantId, phone, message, undefined, assistantId);
        const durationMs = Date.now() - startTime;
        const effectiveId = effectiveAssistantId ?? assistantId;
        let model: string | null = null;
        let temperature: number | null = null;
        try {
            const assistant = getAssistantConfig(tenantId, effectiveId);
            model = (assistant.model && assistant.model.trim()) || null;
            temperature = typeof assistant.temperature === 'number' && !Number.isNaN(assistant.temperature)
                ? assistant.temperature
                : null;
        } catch {
            /* ignore */
        }
        await executionStore.add({
            tenantId,
            assistantId: effectiveId ?? null,
            phone,
            message,
            reply,
            status: 'ok',
            durationMs,
            source: 'webhook',
            debug: {
                ...baseDebug,
                chatDebug: debug ?? null,
                ...(handoff ? { handoff } : {}),
                response: {
                    status: 200,
                    body: { reply },
                },
            },
            model,
            temperature,
        });
        return res.json({ reply });
    } catch (error: any) {
        if (error?.name === 'TenantNotFoundError') {
            await executionStore.add({
                tenantId,
                phone: safePhone,
                message: safeMessage,
                reply: 'Tenant não encontrado',
                status: 'error',
                durationMs: Date.now() - startTime,
                source: 'webhook',
                debug: {
                    ...baseDebug,
                    response: { status: 404, body: { error: 'Tenant não encontrado', code: 'TENANT_NOT_FOUND' } },
                },
            });
            return res.status(404).json({ error: 'Tenant não encontrado', code: 'TENANT_NOT_FOUND' });
        }
        console.error('[WEBHOOK] Erro ao processar mensagem:', error);
        const durationMs = Date.now() - startTime;
        const errorReply = 'Desculpe, tive um problema ao processar. Tente novamente em instantes.';
        await executionStore.add({
            tenantId,
            phone,
            message,
            reply: errorReply,
            status: 'error',
            durationMs,
            source: 'webhook',
            debug: {
                ...baseDebug,
                response: { status: 500, body: { reply: errorReply } },
                error: {
                    message: error?.message || 'Erro interno',
                    name: error?.name || 'Error',
                },
            },
        });
        return res.status(500).json({ reply: errorReply });
    }
}

app.post('/webhook/messages/:tenantId', (req: Request, res: Response) => {
    const raw = req.params.tenantId;
    const tenantId = (typeof raw === 'string' ? raw : (Array.isArray(raw) ? raw[0] : '') ?? '').trim() || 'default';
    return handleWebhookMessage(req, res, tenantId);
});

app.post('/webhook/messages', (req: Request, res: Response) => {
    const body = req.body;
    const tenantId = (body?.tenant_id ?? body?.tenantId ?? body?.channel_id)?.trim() || 'default';
    return handleWebhookMessage(req, res, tenantId);
});

// ─────────────────────────────────────────────────────────────────────────────
// USAGE — totais de tokens e custo estimado por tenant (M6).
// GET /api/usage?tenantId=...&from=...&to=... (datas em ISO). tenantId obrigatório.
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/usage', async (req: Request, res: Response) => {
    const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId.trim() : '';
    if (!tenantId) {
        return res.status(400).json({ error: 'Query tenantId é obrigatório.', code: 'MISSING_TENANT_ID' });
    }
    const from = typeof req.query.from === 'string' ? req.query.from.trim() : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to.trim() : undefined;
    const assistantId = typeof req.query.assistantId === 'string' ? req.query.assistantId.trim() : undefined;
    const totals = await usageStore.getTotalsWithCost(tenantId, from, to, assistantId);
    return res.json(totals);
});

/** GET /api/usage/records — lista paginada de registros de uso (uso por uso). limit máx. 100, default 10. */
app.get('/api/usage/records', async (req: Request, res: Response) => {
    const tenantId = (req.headers['x-tenant-id'] as string)?.trim() || (typeof req.query.tenantId === 'string' ? req.query.tenantId.trim() : '');
    if (!tenantId) {
        return res.status(400).json({ error: 'tenantId é obrigatório (header X-Tenant-Id ou query tenantId).', code: 'MISSING_TENANT_ID' });
    }
    const from = typeof req.query.from === 'string' ? req.query.from.trim() : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to.trim() : undefined;
    const assistantId = typeof req.query.assistantId === 'string' ? req.query.assistantId.trim() : undefined;
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 10));
    const offset = Math.max(0, parseInt(String(req.query.offset), 10) || 0);
    const result = await usageStore.listRecords(tenantId, { from, to, assistantId, limit, offset });
    return res.json(result);
});

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTIONS — painel: listar e detalhar execuções (para debug), por tenant
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/executions', async (req: Request, res: Response) => {
    const rawTenant = (req.headers['x-tenant-id'] as string)?.trim() || (req.query.tenant as string)?.trim();
    const tenantId = rawTenant || 'default';
    const limit = Math.min(200, Math.max(0, parseInt(String(req.query.limit), 10) || 50));
    const offset = Math.max(0, parseInt(String(req.query.offset), 10) || 0);
    const phone = typeof req.query.phone === 'string' ? req.query.phone : undefined;
    const source = req.query.source === 'api' || req.query.source === 'webhook'
        ? req.query.source
        : undefined;
    const status = req.query.status === 'ok' || req.query.status === 'error'
        ? req.query.status
        : undefined;
    const result = await executionStore.list({ limit, offset, phone, tenantId, source, status });
    res.setHeader('X-List-Tenant-Id', tenantId);
    return res.json(result);
});

app.get('/api/executions/by-session', async (req: Request, res: Response) => {
    const tenantId = (req.headers['x-tenant-id'] as string)?.trim() || (req.query.tenant as string)?.trim() || 'default';
    const phone = typeof req.query.phone === 'string' ? req.query.phone.trim() : '';
    if (!phone) return res.status(400).json({ error: 'phone é obrigatório (query).', code: 'MISSING_PHONE' });
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit), 10) || 100));
    const result = await executionStore.listBySession({ tenantId, phone, limit });
    res.setHeader('X-List-Tenant-Id', tenantId);
    return res.json(result);
});

app.get('/api/executions/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    const tenantId = (req.headers['x-tenant-id'] as string)?.trim() || (req.query.tenant as string)?.trim() || 'default';
    const exec = await executionStore.getById(id, tenantId);
    if (!exec) return res.status(404).json({ error: 'Execução não encontrada', code: 'EXECUTION_NOT_FOUND' });
    return res.json(exec);
});

// ─────────────────────────────────────────────────────────────────────────────
// START (só sobe o servidor quando executado diretamente)
// ─────────────────────────────────────────────────────────────────────────────
export { app };

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

if (require.main === module) {
    if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY.trim() === '') {
        console.error(`
┌─────────────────────────────────────────────────────────────────────────┐
│  ⚠️  OPENROUTER_API_KEY não configurada!                                 │
│  Crie/edite .env.local com OPENROUTER_API_KEY=sua-chave                  │
│  O chat com IA não funcionará até que a chave seja definida.             │
└─────────────────────────────────────────────────────────────────────────┘
`);
        if (process.env.NODE_ENV === 'production') {
            process.exit(1);
        }
    }

    app.listen(PORT, () => {
        const companyName = (() => {
            try {
                return getConfig().branding.companyName || 'AltraFlow Mock API';
            } catch {
                return 'AltraFlow Mock API';
            }
        })();
        console.log(`
    ┌──────────────────────────────────────────────────┐
    │   🚀 ${companyName} — http://localhost:${PORT}      │
    ├──────────────────────────────────────────────────┤
    │  Clientes de Teste:                              │
    │  ✅ 12345678000190 — Mercadinho do João (ativo)   │
    │  🔴 98765432000100 — Pão Quente (bloqueado)      │
    │  ⚫ 11122233000144 — Silva Materiais (inativo)    │
    │  ✅ 55566677000188 — Horizonte Engenharia (ativo) │
    │  ✅ 52998224725    — José F. Silva (CPF, ativo)   │
    │  🔴 33344455000166 — Depósito Central (bloqueado) │
    └──────────────────────────────────────────────────┘
    `);
    });
}
