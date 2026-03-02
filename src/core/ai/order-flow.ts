/**
 * Order Flow State Machine — gerencia o fluxo de pedido em código,
 * sem depender do LLM para lógica de negócio.
 * Mensagens são configuráveis via tenant.prompt.orderFlowMessages (painel).
 *
 * Suporta carrinho multi-produto:
 *   idle → awaiting_quantity → awaiting_more_or_checkout
 *        ↗ (usuário quer adicionar mais → idle novamente, LLM busca próximo produto)
 *   awaiting_more_or_checkout → awaiting_cpf → awaiting_confirmation → POST todos os itens → reset
 */
import axios from 'axios';
import { getConfig, getAssistantConfig, type OrderFlowMessages } from '../../config/tenant';
import { parseQuantityFromOrderMessage } from './intent';
import { CLIENTS as DEFAULT_MOCK_CLIENTS } from '../../mock/data';

const DEFAULT_ORDER_FLOW_MESSAGES: Record<string, string> = {
    askProduct: 'Para fazer um pedido, primeiro preciso saber qual produto deseja. Poderia informar o nome ou código?',
    askDocument: 'Para finalizar o pedido, preciso do seu CPF ou CNPJ.',
    askDocumentWithQuantity: 'Para finalizar o pedido, preciso do seu CPF ou CNPJ.',
    invalidDocument: 'Não consegui identificar um CPF ou CNPJ válido. Por favor, informe um CPF (11 dígitos) ou CNPJ (14 dígitos).',
    customerNotFound: 'Não encontramos um cadastro ativo com este documento. Verifique o número informado ou entre em contato com nosso atendimento.',
    customerBlocked: 'O cadastro de **{{name}}** está bloqueado. Por favor, entre em contato com o setor financeiro para regularizar sua situação.',
    askQuantity: 'Produto: **{{productName}}**\nPreço unitário: **R$ {{preco}}**\nEstoque disponível: **{{available}} unidades**\n\nQual a quantidade desejada?',
    onlyNUnitsAvailable: 'Infelizmente só temos **{{available}} unidades** disponíveis de {{productName}}.\n\nDeseja prosseguir com as {{available}} unidades disponíveis?',
    confirmOrder: 'Olá, **{{customerName}}**!\n\nResumo do pedido:\n\n{{cartItems}}\n\n💰 **Total: R$ {{total}}**\n\nConfirma o pedido?',
    confirmOrderQuantity: 'Resumo do pedido:\n\n{{cartItems}}\n\n💰 **Total: R$ {{total}}**\n👤 Cliente: **{{customerName}}**\n\nConfirma o pedido?',
    itemAddedToCart: '✅ **{{productName}}** × {{quantity}} adicionado ao carrinho.\n\n🛒 Carrinho: {{itemCount}} produto(s) — subtotal R$ {{subtotal}}\n\nDeseja **adicionar mais** algum produto ou **finalizar** o pedido?',
    orderSuccess: 'Perfeito! Seu pedido foi registrado com sucesso.\n\n**Número do pedido:** {{pedido_id}}\n\n{{mensagem}} 🙏',
    orderErrorFallback: 'Seu pedido foi anotado e encaminhado para nossa equipe finalizar. Em caso de dúvida, informe que você já confirmou o pedido.\n\nObrigada pela preferência! 🙏',
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
        'itemAddedToCart',
    ] as (keyof OrderFlowMessages)[];
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
    | 'awaiting_more_or_checkout'
    | 'awaiting_cpf'
    | 'awaiting_quantity'
    | 'awaiting_confirmation'
    | 'completed';

/** A single line-item in the cart */
export interface CartItem {
    sku: string;
    nome: string;
    quantidade: number;
    preco_unitario: number;
}

export interface OrderSession {
    state: OrderState;
    /** Accumulated cart items (multi-product support) */
    items: CartItem[];
    /** Currently selected product (set from last stock query) */
    product: {
        nome: string;
        sku: string;
        estoque_disponivel: number;
        preco_unitario: number;
        preco_promocional: number | null;
    } | null;
    /** Customer document (CPF/CNPJ) */
    document: string | null;
    /** Requested quantity for the current product */
    quantity: number | null;
    /** Customer name (after validation) */
    customerName: string | null;
}

export const createOrderSession = (): OrderSession => ({
    state: 'idle',
    items: [],
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

/** Formats cart items as a markdown list */
function buildCartText(items: CartItem[]): string {
    return items
        .map((item) => `📦 **${item.nome}** × ${item.quantidade} un. — R$ ${(item.preco_unitario * item.quantidade).toFixed(2)}`)
        .join('\n');
}

/** Sums the total price of all cart items */
function cartTotal(items: CartItem[]): number {
    return items.reduce((acc, item) => acc + item.preco_unitario * item.quantidade, 0);
}

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
    const s: OrderSession = { ...session, items: session.items ?? [] };
    const msg = getOrderFlowMessages(tenantId);
    console.log(`[ORDER] state=${s.state} | intent=${intent} | items=${s.items.length} | msg="${message.substring(0, 30)}"`); 

    // When in cart mode and user initiates a new product order, reset to idle so the item-add logic runs
    if (s.state === 'awaiting_more_or_checkout' && (intent === 'START_ORDER' || intent === 'START_ORDER_WITH_QUANTITY')) {
        s.state = 'idle';
    }

    // ── STATE: idle → Start order ──
    if (s.state === 'idle' || intent === 'START_ORDER' || intent === 'START_ORDER_WITH_QUANTITY') {
        if (!s.product) {
            return {
                reply: msg.askProduct,
                newState: { ...s, state: 'idle' },
            };
        }

        // "quero N unidades": parse qty immediately, add to cart, then ask for more or checkout
        if (intent === 'START_ORDER_WITH_QUANTITY') {
            const qty = parseQuantityFromOrderMessage(message);
            if (qty != null && qty > 0) {
                const available = s.product.estoque_disponivel;
                const finalQty = Math.min(qty, available);
                const preco = s.product.preco_promocional || s.product.preco_unitario;

                if (qty > available) {
                    // Will be confirmed (available units) in next message
                    s.quantity = available;
                    s.state = 'awaiting_confirmation';
                    // Ask for stock-limit confirmation before adding
                    return {
                        reply: applyTemplate(msg.onlyNUnitsAvailable, { available, productName: s.product.nome }),
                        newState: s,
                    };
                }

                // Add item to cart
                s.items = [...s.items, { sku: s.product.sku, nome: s.product.nome, quantidade: finalQty, preco_unitario: preco }];
                const subtotal = cartTotal(s.items).toFixed(2);
                s.quantity = null;
                s.product = null;
                s.state = 'awaiting_more_or_checkout';
                return {
                    reply: applyTemplate(msg.itemAddedToCart || '✅ **{{productName}}** × {{quantity}} adicionado.\n\nDeseja adicionar mais algum produto ou **finalizar** o pedido?', {
                        productName: s.items[s.items.length - 1].nome,
                        quantity: finalQty,
                        itemCount: s.items.length,
                        subtotal,
                    }),
                    newState: s,
                };
            }
        }

        // Ask quantity for selected product
        s.state = 'awaiting_quantity';
        const preco = s.product.preco_promocional || s.product.preco_unitario;
        return {
            reply: applyTemplate(msg.askQuantity, {
                productName: s.product.nome,
                preco: preco.toFixed(2),
                available: s.product.estoque_disponivel,
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
        const preco = s.product!.preco_promocional || s.product!.preco_unitario;

        if (qty > available) {
            // Offer max available before adding
            s.quantity = available;
            s.state = 'awaiting_confirmation';
            return {
                reply: applyTemplate(msg.onlyNUnitsAvailable, { available, productName: s.product!.nome }),
                newState: s,
            };
        }

        // Add item to cart
        s.items = [...s.items, { sku: s.product!.sku, nome: s.product!.nome, quantidade: qty, preco_unitario: preco }];
        const subtotal = cartTotal(s.items).toFixed(2);
        s.quantity = null;
        s.product = null;
        s.state = 'awaiting_more_or_checkout';

        return {
            reply: applyTemplate(msg.itemAddedToCart || '✅ **{{productName}}** × {{quantity}} adicionado.\n\nDeseja adicionar mais algum produto ou **finalizar** o pedido?', {
                productName: s.items[s.items.length - 1].nome,
                quantity: qty,
                itemCount: s.items.length,
                subtotal,
            }),
            newState: s,
        };
    }

    // ── STATE: awaiting_more_or_checkout ──
    if (s.state === 'awaiting_more_or_checkout') {
        const msgLower = message.toLowerCase();
        const wantsMore = intent === 'CONFIRM'
            || /adicionar|mais\s+um|mais\s+produto|outro\s+produto|quero\s+mais|sim[,.]?\s*mais|sim[,.]?\s*adicion/i.test(msgLower);
        const wantsCheckout = intent === 'DENY'
            || /finalizar|conclu|terminar|só\s*(isso|esses|esses?)|nada\s*mais|não\s*quero\s*mais|^(não|nao)[,.]?\s*$|pode\s*finalizar|fechar\s*(o\s*)?pedido/i.test(msgLower);

        if (wantsCheckout) {
            // Proceed to CPF collection if not yet validated
            if (s.document && s.customerName) {
                // Already have customer data — go straight to confirmation
                s.state = 'awaiting_confirmation';
                const cartItems = buildCartText(s.items);
                const total = cartTotal(s.items).toFixed(2);
                return {
                    reply: applyTemplate(msg.confirmOrderQuantity || msg.confirmOrder, {
                        cartItems,
                        total,
                        customerName: s.customerName,
                    }),
                    newState: s,
                };
            }
            s.state = 'awaiting_cpf';
            return {
                reply: msg.askDocument,
                newState: s,
            };
        }

        if (wantsMore) {
            // Return to idle so the LLM takes over for the next product search
            s.state = 'idle';
            return {
                reply: 'Claro! Pode pesquisar o próximo produto. Quando encontrar, é só dizer a quantidade e eu adiciono ao carrinho. 🛒',
                newState: s,
            };
        }

        // Unknown response: re-prompt
        return {
            reply: 'Deseja **adicionar mais** algum produto ou **finalizar** o pedido?\n\nResponda "adicionar mais" ou "finalizar".',
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
                    newState: { ...s, state: 'idle', items: [] },
                };
            }
            return {
                reply: msg.customerNotFound,
                newState: s,
            };
        }

        s.document = doc;
        s.customerName = validation.name || null;
        s.state = 'awaiting_confirmation';

        const cartItems = buildCartText(s.items);
        const total = cartTotal(s.items).toFixed(2);

        return {
            reply: applyTemplate(msg.confirmOrder, {
                cartItems,
                total,
                customerName: s.customerName ?? '',
                // Legacy single-product vars (in case tenant has custom template):
                productName: s.items[0]?.nome ?? '',
                quantity: s.items[0]?.quantidade ?? '',
            }),
            newState: s,
        };
    }

    // ── STATE: awaiting_confirmation ──
    if (s.state === 'awaiting_confirmation') {
        // Handle stock-limit scenario (s.quantity set, product still in session)
        if (s.product && s.quantity != null) {
            if (intent === 'CONFIRM') {
                const preco = s.product.preco_promocional || s.product.preco_unitario;
                s.items = [...s.items, { sku: s.product.sku, nome: s.product.nome, quantidade: s.quantity, preco_unitario: preco }];
                const subtotal = cartTotal(s.items).toFixed(2);
                s.quantity = null;
                s.product = null;
                s.state = 'awaiting_more_or_checkout';
                return {
                    reply: applyTemplate(msg.itemAddedToCart || '✅ **{{productName}}** × {{quantity}} adicionado.\n\nDeseja adicionar mais algum produto ou **finalizar** o pedido?', {
                        productName: s.items[s.items.length - 1].nome,
                        quantity: s.items[s.items.length - 1].quantidade,
                        itemCount: s.items.length,
                        subtotal,
                    }),
                    newState: s,
                };
            }
            if (intent === 'DENY') {
                return {
                    reply: msg.orderCancelled,
                    newState: createOrderSession(),
                };
            }
            return { reply: msg.confirmYesNo, newState: s };
        }

        // Full cart confirmation
        if (intent === 'CONFIRM') {
            s.state = 'completed';
            let reply: string;
            try {
                const base = getApiBaseUrl(tenantId, assistantId);
                const pedidoRoute = getRoute(tenantId ?? 'default', assistantId, 'pedido_post');
                const res = await axios.post(`${base}${pedidoRoute}`, {
                    documento: s.document,
                    cliente_nome: s.customerName,
                    itens: s.items.map((item) => ({
                        sku: item.sku,
                        nome: item.nome,
                        quantidade: item.quantidade,
                        preco_unitario: item.preco_unitario,
                    })),
                });
                const { pedido_id, mensagem } = res.data;
                reply = applyTemplate(msg.orderSuccess, {
                    pedido_id: pedido_id ?? '—',
                    mensagem: mensagem ?? 'Obrigada pela preferência!',
                    // Legacy single-product vars:
                    quantity: s.items[0]?.quantidade ?? '',
                    productName: s.items[0]?.nome ?? '',
                });
            } catch (err) {
                console.error('[ORDER] Erro ao criar pedido na API:', err);
                reply = applyTemplate(msg.orderErrorFallback, {
                    quantity: s.items[0]?.quantidade ?? '',
                    productName: s.items[0]?.nome ?? '',
                });
            }
            return {
                reply,
                newState: createOrderSession(),
            };
        }

        if (intent === 'DENY') {
            return {
                reply: msg.orderCancelled,
                newState: createOrderSession(),
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
