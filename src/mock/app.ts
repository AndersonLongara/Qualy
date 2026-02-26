import express, { Request, Response } from 'express';
import cors from 'cors';
import { productMatchesSearch } from '../core/productSearch';
import { CLIENTS, TITULOS, PEDIDOS, ESTOQUE, PLANOS_PAGAMENTO } from './data';

const app = express();
app.use(cors());
app.use(express.json());

const getDoc = (req: Request) => (req.query.doc as string)?.replace(/\D/g, '') || '';
const daysFromNow = (n: number) =>
    new Date(Date.now() + n * 86400000).toISOString().split('T')[0];

// 1. Clientes
app.get('/v1/clientes', (req: Request, res: Response) => {
    const doc = getDoc(req);
    const client = CLIENTS[doc];
    if (client) res.json(client);
    else res.status(404).json({ code: 'CLIENT_NOT_FOUND', message: 'Cliente não encontrado.' });
});

app.post('/v1/auth/send-code', (_req: Request, res: Response) => {
    res.json({ message: 'Código de verificação enviado para o contato cadastrado.' });
});

app.post('/v1/auth/verify-code', (req: Request, res: Response) => {
    const { code } = req.body;
    if (code === '123456') res.json({ token: 'MOCK_TOKEN_123', expires_in: 600 });
    else if (code === '000000') res.status(401).json({ code: 'CODE_EXPIRED', message: 'Código expirado.' });
    else res.status(401).json({ code: 'INVALID_CODE', message: 'Código inválido.' });
});

// 2. Financeiro
app.get('/v1/financeiro/titulos', (req: Request, res: Response) => {
    const doc = getDoc(req);
    const titulos = TITULOS[doc] || [];
    const status = req.query.status as string;
    const result = status ? titulos.filter(t => t.status === status) : titulos;
    res.json(result);
});

app.post('/v1/financeiro/titulos/:id/segunda-via', (req: Request, res: Response) => {
    const { id } = req.params;
    res.json({ message: '2ª via enviada.', boleto_url: `https://example.com/boleto-${id}.pdf` });
});

// 3. Faturamento
app.get('/v1/faturamento/pedidos', (req: Request, res: Response) => {
    const doc = getDoc(req);
    const pedidos = PEDIDOS[doc] || [];
    const status = req.query.status as string;
    const result = status ? pedidos.filter(p => p.status === status) : pedidos;
    res.json(result);
});

// 4. Estoque — busca flexível por tokens
app.get('/v1/vendas/estoque', (req: Request, res: Response) => {
    const busca = (req.query.busca as string || '').trim();
    const categoria = (req.query.categoria as string || '').toLowerCase();
    let result = ESTOQUE;
    if (busca) result = result.filter((p: any) => productMatchesSearch(busca, p.nome ?? '', p.sku ?? ''));
    if (categoria) result = result.filter((p: any) => (p.categoria || '').toLowerCase() === categoria);
    res.json(result);
});

// 5. Planos de Pagamento
app.get('/v1/vendas/planos-pagamento', (_req: Request, res: Response) => {
    res.json(PLANOS_PAGAMENTO);
});

// 6. Criar Pedido
app.post('/v1/vendas/pedido', (_req: Request, res: Response) => {
    res.status(201).json({
        pedido_id: 'PED-NEW-001',
        status: 'aguardando_analise',
        mensagem: 'Pedido recebido! Você receberá a confirmação em breve.',
        previsao_faturamento: daysFromNow(1),
    });
});

// 7. Handoff
app.post('/v1/handoff', (req: Request, res: Response) => {
    const { motivo } = req.body;
    res.json({
        ticket_id: 'TKT-1234',
        fila: motivo?.toLowerCase().includes('financ') ? 'financeiro' : 'comercial',
        tempo_espera_estimado: '~5 minutos',
        mensagem: 'Transferindo para um atendente.',
    });
});

export default app;
