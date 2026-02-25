/**
 * Order Flow State Machine — gerencia o fluxo de pedido em código,
 * sem depender do LLM para lógica de negócio.
 * Mensagens são configuráveis via tenant.prompt.orderFlowMessages (painel).
 */
import axios from 'axios';
import { getConfig, getAssistantConfig, type OrderFlowMessages } from '../../config/tenant';
import { parseQuantityFromOrderMessage } from './intent';
import { CLIENTS as DEFAULT_MOCK_CLIENTS } from '../../mock/data';

const DEFAULT_ORDER_FLOW_MESSAGES: Record<string, string> = {
    askProduct: 'Para fazer um pedido, primeiro preciso saber qual produto deseja. Poderia informar o nome ou código?',
    askDocument: 'Ótimo! Você deseja fazer um pedido de **{{productName}}**.\n\nPara prosseguir, preciso que informe seu CPF ou CNPJ.',
    askDocumentWithQuantity: 'Ótimo! Você quer **{{qty}} unidades** de **{{productName}}** (total R$ {{total}}).\n\nPara prosseguir, preciso que informe seu CPF ou CNPJ.',
    invalidDocument: 'Não consegui identificar um CPF ou CNPJ válido. Por favor, informe um CPF (11 dígitos) ou CNPJ (14 dígitos).',
    customerNotFound: 'Não encontramos um cadastro ativo com este documento. Verifique o número informado ou entre em contato com nosso atendimento.',
    customerBlocked: 'O cadastro de **{{name}}** está bloqueado. Por favor, entre em contato com o setor financeiro para regularizar sua situação.',
    askQuantity: 'Cadastro validado! Olá, **{{customerName}}**.\n\nProduto: **{{productName}}**\nPreço unitário: **R$ {{preco}}**\nEstoque disponível: **{{available}} unidades**\n\nQual a quantidade desejada?',
    onlyNUnitsAvailable: 'Infelizmente só temos **{{available}} unidades** disponíveis de {{productName}}.\n\nDeseja prosseguir com as {{available}} unidades disponíveis?',
    confirmOrder: 'Cadastro validado! Olá, **{{customerName}}**.\n\nResumo do pedido:\n\n📦 **{{productName}}** × {{quantity}} unidades\n💰 Total: **R$ {{total}}**\n👤 Cliente: **{{customerName}}**\n\nConfirma o pedido?',
    confirmOrderQuantity: 'Resumo do pedido:\n\n📦 **{{productName}}** × {{quantity}} unidades\n💰 Total: **R$ {{total}}**\n👤 Cliente: **{{customerName}}**\n\nConfirma o pedido?',
    orderSuccess: 'Perfeito! Seu pedido de **{{quantity}} unidades** de **{{productName}}** foi registrado.\n\n**Número do pedido:** {{pedido_id}}\n\n{{mensagem}} 🙏',
    orderErrorFallback: 'Seu pedido de **{{quantity}} unidades** de **{{productName}}** foi anotado e encaminhado para nossa equipe finalizar. Em caso de dúvida, informe que você já confirmou o pedido.\n\nObrigada pela preferência! 🙏',
    orderCancelled: 'Pedido cancelado. Se precisar de algo mais, estou à disposição!',
    confirmYesNo: 'Por favor, confirme com **Sim** para prosseguir ou **Não** para cancelar o pedido.',
};

function getOrderFlowMessages(tenantId?: string): Record<string, string> {
    const config = getConfig(tenantId ?? 'default');
    const custom = config.prompt.orderFlowMessages;
    if (!custom || typeof custom !== 'object') return { ...DEFAULT_ORDER_FLOW_MESSAGES };
    const out = { ...DEFAULT_ORDER_FLOW_MESSAGES };
    const keys: (keyof OrderFlowMessages)[] = [
        'askProduct', 'askDocument', 'askDocumentWithQuantity', 'invalidDocument', 'customerNotFound', 'customerBlocked',
        'askQuantity', 'onlyNUnitsAvailable', 'confirmOrder', 'orderSuccess', 'orderErrorFallback', 'orderCancelled', 'confirmYesNo',
    ];
    for (const k of keys) {
        const v = custom[k];
        if (typeof v === 'string' && v.trim()) out[k] = v.trim();
    }
    if (typeof custom.confirmOrder === 'string' && custom.confirmOrder.trim()) out.confirmOrderQuantity = custom.confirmOrder.trim();
    return out;
}

function applyTemplate(template: string, vars: Record<string, string | number | undefined | null>): string {
    let s = template;
    for (const [key, value] of Object.entries(vars)) {
        s = s.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value ?? ''));
    }
    return s;
}

function getApiBaseUrl(tenantId?: string, assistantId?: string | null): string {
    const assistant = getAssistantConfig(tenantId ?? 'default', assistantId);
    if (assistant.api?.mode === 'production' && assistant.api.baseUrl) {
        return assistant.api.baseUrl.replace(/\/$/, '');
    }
    const config = getConfig(tenantId);
    const base = config.api.baseUrl || 'http://localhost:3001';
    return base.replace(/\/$/, '');
}

function getRoute(tenantId: string, assistantId: string | undefined, key: 'clientes' | 'pedido_post'): string {
    const defaults = { clientes: '/v1/clientes', pedido_post: '/v1/vendas/pedido' };
    const assistant = getAssistantConfig(tenantId, assistantId);
    return assistant.api?.routes?.[key] ?? defaults[key];
}

export type OrderState =
    | 'idle'
    | 'awaiting_cpf'
    | 'awaiting_quantity'
    | 'awaiting_confirmation'
    | 'completed';

export interface OrderSession {
    state: OrderState;
    /** Product data from last stock query (if any) */
    product: {
        nome: string;
        sku: string;
        estoque_disponivel: number;
        preco_unitario: number;
        preco_promocional: number | null;
    } | null;
    /** Customer document (CPF/CNPJ) */
    document: string | null;
    /** Requested quantity */
    quantity: number | null;
    /** Customer name (after validation) */
    customerName: string | null;
}

export const createOrderSession = (): OrderSession => ({
    state: 'idle',
    product: null,
    document: null,
    quantity: null,
    customerName: null,
});

/** Extracts digits-only from a CPF/CNPJ string */
const extractDocument = (text: string): string | null => {
    const digits = text.replace(/\D/g, '');
    if (digits.length === 11 || digits.length === 14) return digits;
    return null;
};

/** Validates a customer document: usa mock do agente quando mode=mock, senão chama a API. */
const validateCustomer = async (document: string, tenantId?: string, assistantId?: string): Promise<{ valid: boolean; name?: string; blocked?: boolean }> => {
    const tid = tenantId ?? 'default';
    const aid = assistantId ?? undefined;
    const assistant = getAssistantConfig(tid, aid);

    const digitsOnly = document.replace(/\D/g, '');
    if (assistant.api?.mode === 'mock' && assistant.api.mockData?.clientes && typeof assistant.api.mockData.clientes === 'object') {
        const clientes = assistant.api.mockData.clientes as Record<string, Record<string, unknown>>;
        // Lookup: chave exata (CNPJ/CPF só dígitos) ou variante sem "00" no meio (ex.: plataforma com "12345678195" e usuário digita 12345678000195)
        const client =
            clientes[digitsOnly] ??
            (digitsOnly.length === 14 ? clientes[digitsOnly.replace(/00(\d{3})$/, '$1')] : undefined);
        if (client && typeof client === 'object') {
            const status = (client.status as string)?.toLowerCase?.() ?? '';
            const name = (client.fantasia as string) || (client.razao_social as string) || (client.name as string) || 'Cliente';
            if (status === 'bloqueado') {
                return { valid: false, blocked: true, name };
            }
            if (status === 'ativo') {
                return { valid: true, name };
            }
            return { valid: false, name };
        }
        // Mock do agente não tem o documento: tenta API (mock global do servidor)
    }

    try {
        const base = getApiBaseUrl(tenantId, assistantId);
        const route = getRoute(tenantId ?? 'default', assistantId, 'clientes');
        const res = await axios.get(`${base}${route}`, { params: { doc: document } });
        const client = res.data;
        if (client.status === 'bloqueado') {
            return { valid: false, blocked: true, name: client.razao_social || client.fantasia };
        }
        if (client.status !== 'ativo') {
            return { valid: false, name: client.razao_social || client.fantasia };
        }
        return { valid: true, name: client.fantasia || client.razao_social };
    } catch {
        // HTTP falhou (ex.: Vercel não chama a si mesmo). Usa mock global compartilhado (mesmo estilo do estoque).
        const client = DEFAULT_MOCK_CLIENTS[digitsOnly];
        if (client && typeof client === 'object') {
            const status = (client.status as string)?.toLowerCase?.() ?? '';
            const name = (client.fantasia as string) || (client.razao_social as string) || 'Cliente';
            if (status === 'bloqueado') return { valid: false, blocked: true, name };
            if (status === 'ativo') return { valid: true, name };
            return { valid: false, name };
        }
        return { valid: false };
    }
};

interface FlowResult {
    reply: string;
    newState: OrderSession;
}

/**
 * Processes a user message within the order flow.
 * Returns a fixed response and updated session state.
 * tenantId e assistantId: usados para resolver api.baseUrl e rotas do agente.
 */
export const processOrderFlow = async (
    message: string,
    session: OrderSession,
    intent: string,
    tenantId?: string,
    assistantId?: string
): Promise<FlowResult> => {
    const s = { ...session };
    const msg = getOrderFlowMessages(tenantId);
    console.log(`[ORDER] state=${s.state} | intent=${intent} | msg="${message.substring(0, 30)}"`);

    // ── STATE: idle → Start order (com ou sem quantidade) ──
    if (s.state === 'idle' || intent === 'START_ORDER' || intent === 'START_ORDER_WITH_QUANTITY') {
        if (!s.product) {
            return {
                reply: msg.askProduct,
                newState: { ...s, state: 'idle' },
            };
        }
        // "quero N unidades" / "sim quero 2 unidades": já define quantidade e pede CPF
        if (intent === 'START_ORDER_WITH_QUANTITY') {
            const qty = parseQuantityFromOrderMessage(message);
            if (qty != null) {
                const available = s.product.estoque_disponivel;
                if (qty > available) {
                    s.quantity = available;
                    s.state = 'awaiting_confirmation';
                    return {
                        reply: applyTemplate(msg.onlyNUnitsAvailable, { available, productName: s.product.nome }),
                        newState: s,
                    };
                }
                s.quantity = qty;
                s.state = 'awaiting_cpf';
                const preco = s.product.preco_promocional || s.product.preco_unitario;
                const total = (preco * qty).toFixed(2);
                return {
                    reply: applyTemplate(msg.askDocumentWithQuantity, { qty, productName: s.product.nome, total }),
                    newState: s,
                };
            }
        }
        s.state = 'awaiting_cpf';
        return {
            reply: applyTemplate(msg.askDocument, { productName: s.product.nome }),
            newState: s,
        };
    }

    // ── STATE: awaiting_cpf ──
    if (s.state === 'awaiting_cpf') {
        const doc = extractDocument(message);
        if (!doc) {
            return {
                reply: msg.invalidDocument,
                newState: s,
            };
        }

        console.log(`[ORDER] Validando documento: ${doc}`);
        const validation = await validateCustomer(doc, tenantId, assistantId);

        if (!validation.valid) {
            if (validation.blocked) {
                return {
                    reply: applyTemplate(msg.customerBlocked, { name: validation.name }),
                    newState: { ...s, state: 'idle' },
                };
            }
            return {
                reply: msg.customerNotFound,
                newState: s,
            };
        }

        s.document = doc;
        s.customerName = validation.name || null;

        const preco = s.product!.preco_promocional || s.product!.preco_unitario;
        // Se quantidade já foi definida (ex.: "sim quero 2 unidades"), vai direto para confirmação
        if (s.quantity != null && s.quantity > 0) {
            const total = (preco * s.quantity).toFixed(2);
            s.state = 'awaiting_confirmation';
            return {
                reply: applyTemplate(msg.confirmOrder, {
                    productName: s.product!.nome,
                    quantity: s.quantity,
                    total,
                    customerName: s.customerName ?? '',
                }),
                newState: s,
            };
        }
        s.state = 'awaiting_quantity';
        return {
            reply: applyTemplate(msg.askQuantity, {
                productName: s.product!.nome,
                preco: preco.toFixed(2),
                available: s.product!.estoque_disponivel,
                customerName: s.customerName ?? '',
            }),
            newState: s,
        };
    }

    // ── STATE: awaiting_quantity ──
    if (s.state === 'awaiting_quantity') {
        const qty = parseInt(message.replace(/\D/g, ''), 10);
        if (isNaN(qty) || qty <= 0) {
            return {
                reply: 'Por favor, informe uma quantidade válida (número inteiro positivo).',
                newState: s,
            };
        }

        const available = s.product!.estoque_disponivel;

        if (qty > available) {
            s.quantity = available;
            s.state = 'awaiting_confirmation';
            return {
                reply: applyTemplate(msg.onlyNUnitsAvailable, { available, productName: s.product!.nome }),
                newState: s,
            };
        }

        s.quantity = qty;
        const preco = s.product!.preco_promocional || s.product!.preco_unitario;
        const total = (preco * qty).toFixed(2);
        s.state = 'awaiting_confirmation';

        return {
            reply: applyTemplate(msg.confirmOrderQuantity || msg.confirmOrder, {
                productName: s.product!.nome,
                quantity: qty,
                total,
                customerName: s.customerName ?? '',
            }),
            newState: s,
        };
    }

    // ── STATE: awaiting_confirmation ──
    if (s.state === 'awaiting_confirmation') {
        if (intent === 'CONFIRM') {
            s.state = 'completed';
            const preco = s.product!.preco_promocional || s.product!.preco_unitario;
            let reply: string;
            try {
                const base = getApiBaseUrl(tenantId, assistantId);
                const pedidoRoute = getRoute(tenantId ?? 'default', assistantId, 'pedido_post');
                const res = await axios.post(`${base}${pedidoRoute}`, {
                    documento: s.document,
                    cliente_nome: s.customerName,
                    itens: [{
                        sku: s.product!.sku,
                        nome: s.product!.nome,
                        quantidade: s.quantity,
                        preco_unitario: preco,
                    }],
                });
                const { pedido_id, mensagem } = res.data;
                reply = applyTemplate(msg.orderSuccess, {
                    quantity: s.quantity ?? 0,
                    productName: s.product!.nome,
                    pedido_id: pedido_id ?? '—',
                    mensagem: mensagem ?? 'Obrigada pela preferência!',
                });
            } catch (err) {
                console.error('[ORDER] Erro ao criar pedido na API:', err);
                reply = applyTemplate(msg.orderErrorFallback, {
                    quantity: s.quantity ?? 0,
                    productName: s.product!.nome,
                });
            }
            return {
                reply,
                newState: createOrderSession(), // Reset
            };
        }
        if (intent === 'DENY') {
            return {
                reply: msg.orderCancelled,
                newState: createOrderSession(), // Reset
            };
        }

        return {
            reply: msg.confirmYesNo,
            newState: s,
        };
    }

    // Fallback
    return {
        reply: 'Desculpe, não entendi. Poderia repetir?',
        newState: s,
    };
};
