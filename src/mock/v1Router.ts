/**
 * Router da API mock /v1 — clientes, auth, financeiro, faturamento, vendas, handoff.
 * Montado em server.ts como app.use('/v1', v1Router).
 * Permite trocar a implementação por API real sem alterar o restante do servidor.
 */
import { Router, Request, Response } from 'express';
import { productMatchesSearch } from '../core/productSearch';

export interface V1RouterDeps {
    clients: Record<string, any>;
    titulos: Record<string, any[]>;
    pedidos: Record<string, any[]>;
    estoque: any[];
    planosPagamento: any[];
    daysFromNow: (n: number) => string;
    log?: boolean;
}

const getDoc = (req: Request) => (req.query.doc as string)?.replace(/\D/g, '') || '';

export function createV1Router(deps: V1RouterDeps): Router {
    const { clients, titulos, pedidos, estoque, planosPagamento, daysFromNow, log = true } = deps;
    const router = Router();

    // 1. Clientes
    router.get('/clientes', (req: Request, res: Response) => {
        const doc = getDoc(req);
        const client = clients[doc];
        if (client) {
            if (log) console.log(`[MOCK] Cliente: ${client.fantasia} (${client.status})`);
            res.json(client);
        } else {
            res.status(404).json({ code: 'CLIENT_NOT_FOUND', message: 'Cliente não encontrado.' });
        }
    });

    router.post('/auth/send-code', (req: Request, res: Response) => {
        const { documento } = req.body;
        if (log) console.log(`[MOCK] OTP enviado para: ${documento}`);
        res.json({ message: 'Código de verificação enviado para o contato cadastrado.' });
    });

    router.post('/auth/verify-code', (req: Request, res: Response) => {
        const { code } = req.body;
        if (code === '123456') {
            res.json({ token: 'MOCK_TOKEN_123', expires_in: 600 });
        } else if (code === '000000') {
            res.status(401).json({ code: 'CODE_EXPIRED', message: 'Código expirado. Solicite um novo.' });
        } else {
            res.status(401).json({ code: 'INVALID_CODE', message: 'Código inválido.' });
        }
    });

    // 2. Financeiro
    router.get('/financeiro/titulos', (req: Request, res: Response) => {
        const doc = getDoc(req);
        const list = titulos[doc] || [];
        const status = req.query.status as string;
        const result = status ? list.filter((t: any) => t.status === status) : list;
        res.json(result);
    });

    router.post('/financeiro/titulos/:id/segunda-via', (req: Request, res: Response) => {
        const { id } = req.params;
        res.json({ message: '2ª via enviada por e-mail e disponível no link.', boleto_url: `https://example.com/boleto-${id}.pdf` });
    });

    // 3. Faturamento
    router.get('/faturamento/pedidos', (req: Request, res: Response) => {
        const doc = getDoc(req);
        const list = pedidos[doc] || [];
        const status = req.query.status as string;
        const result = status ? list.filter((p: any) => p.status === status) : list;
        res.json(result);
    });

    // 4. Estoque — busca flexível por tokens (ex.: "cp 2" e "cimento 50kg" encontram "Cimento CP-II 50kg")
    router.get('/vendas/estoque', (req: Request, res: Response) => {
        const busca = (req.query.busca as string || '').trim();
        const categoria = (req.query.categoria as string || '').toLowerCase();
        let result = [...estoque];
        if (busca) result = result.filter((p: any) => productMatchesSearch(busca, p.nome ?? '', p.sku ?? ''));
        if (categoria) result = result.filter((p: any) => (p.categoria || '').toLowerCase() === categoria);
        res.json(result);
    });

    router.get('/vendas/planos-pagamento', (_req: Request, res: Response) => {
        res.json(planosPagamento);
    });

    router.post('/vendas/pedido', (req: Request, res: Response) => {
        const pedido = req.body;
        if (log) console.log('[MOCK] Novo pedido:', pedido);
        res.status(201).json({
            pedido_id: `PED-NEW-${Math.floor(Math.random() * 900) + 100}`,
            status: 'aguardando_analise',
            mensagem: 'Pedido recebido! Você receberá a confirmação em breve.',
            previsao_faturamento: daysFromNow(1),
        });
    });

    // 7. Handoff
    router.post('/handoff', (req: Request, res: Response) => {
        const { motivo } = req.body;
        if (log) console.log(`[MOCK] Handoff solicitado — Motivo: ${motivo}`);
        res.json({
            ticket_id: `TKT-${Math.floor(Math.random() * 9000) + 1000}`,
            fila: motivo?.toLowerCase().includes('financ') ? 'financeiro' : 'comercial',
            tempo_espera_estimado: '~5 minutos',
            mensagem: 'Transferindo para um atendente. Aguarde um momento.',
        });
    });

    return router;
}
