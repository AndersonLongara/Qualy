/**
 * Lógica reutilizável de processamento de mensagem de chat.
 * Usada por POST /api/chat e pelo webhook de mensageria (C13).
 * Multi-tenant (M1): tenantId identifica o cliente; sessão e config são por tenant.
 */
import { getConfig, getAssistantConfig } from '../../config/tenant';
import { detectIntent } from '../ai/intent';
import { createOrderSession, processOrderFlow } from '../ai/order-flow';
import { getAIResponse } from '../ai/provider';
import { sessionStore, currentAgentStore } from '../../mock/sessionStore';

export interface HandoffInfo {
    /** ID do agente de destino para onde o cliente foi transferido. */
    targetAgentId: string;
    /** Mensagem de transição gerada pelo agente de origem (já incluída no reply). */
    transitionMessage: string;
    /** Primeira mensagem do agente de destino já com o contexto da transferência (conversa ativa). */
    initialReply?: string;
}

export interface ProcessChatResult {
    reply: string;
    debug?: any;
    /** Presente quando o agente atual transferiu o atendimento para outro agente. */
    handoff?: HandoffInfo | null;
    /** ID do agente efetivamente usado (pode ser o persistido após handoff). Para log e sincronia com o cliente. */
    effectiveAssistantId?: string | null;
}

const DEFAULT_TENANT = 'default';

/** Indica se o texto da resposta parece uma mensagem de transferência efetiva (não apenas pedido de confirmação). */
function replyLooksLikeTransfer(reply: string): boolean {
    const r = (reply || '').trim().toLowerCase();
    const askingConfirmation = /\b(pode ser\??|posso te (encaminhar|transferir)\??|aguardo (sua )?confirmação|quer que eu transfira|posso transferir)\b/i.test(r);
    if (askingConfirmation) return false;
    const hasTransferVerb = /\b(encaminhar|transferir|direcionar|te direciono|vou te (encaminhar|transferir|direcionar)|encaminho)\b/i.test(r);
    const hasTarget = /\b(setor|vendas|vendedor|comercial|financeiro|sac|atendente)\b/i.test(r);
    return hasTransferVerb && (hasTarget || r.length > 30);
}

/** Última mensagem do assistente no histórico pediu confirmação de transferência? (ex.: "Pode ser?") */
function lastAssistantAskedTransferConfirmation(history: Array<{ role: string; content?: string }>): boolean {
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].role === 'assistant') {
            const c = (history[i].content || '').trim().toLowerCase();
            return /\b(pode ser\??|posso (te )?(encaminhar|transferir)\??|aguardo (sua )?confirmação|quer que eu transfira|posso transferir|confirma\??)\b/i.test(c) ||
                (/\b(transferir|encaminhar)\b/i.test(c) && c.length < 120);
        }
    }
    return false;
}

/** Mensagem do usuário é confirmação curta (sim, pode, ok, claro)? */
function userMessageIsConfirmation(message: string): boolean {
    const m = (message || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (m.length > 40) return false;
    return /^(sim|pode|pode ser|ok|claro|com certeza|pode sim|pode ser sim|tudo bem|blz|beleza|pode ir|pode transferir|quero|aceito)$/i.test(m) ||
        /^sim[,!.]?\s*$/i.test(m) || /^ok[,!.]?\s*$/i.test(m);
}

/**
 * Processa uma mensagem do usuário e retorna a resposta do assistente.
 * Atualiza a sessão no store (histórico, order state, lastProduct). Sessão isolada por tenant e por assistente (tenantId:assistantId:phone).
 *
 * @param tenantId - Identificador do tenant (cliente). Use "default" para single-tenant.
 * @param phone - Identificador do usuário/canal (ex.: número WhatsApp)
 * @param message - Texto da mensagem
 * @param history - Histórico opcional enviado pelo frontend; se array vazio, limpa a sessão
 * @param assistantId - ID do agente (quando há múltiplos por tenant); opcional.
 */
export async function processChatMessage(
    tenantId: string,
    phone: string,
    message: string,
    history?: any[],
    assistantId?: string | null
): Promise<ProcessChatResult> {
    const tid = tenantId?.trim() || DEFAULT_TENANT;
    const storedAgent = await currentAgentStore.get(tid, phone);
    const requestedId = (assistantId && assistantId.trim()) ? assistantId.trim() : undefined;
    const effectiveAssistantId = (storedAgent && storedAgent.trim()) ? storedAgent.trim().toLowerCase() : (requestedId ? requestedId.toLowerCase() : undefined);
    const session = await sessionStore.get(tid, phone, effectiveAssistantId);
    let intent = detectIntent(message);
    // Garante que pedidos explícitos de transferência sempre vão para a IA (tool transferir_para_agente)
    if (intent === 'HUMAN_AGENT' && /\btransferir\b/i.test(message.trim())) {
        intent = 'UNKNOWN';
    }
    const config = getConfig(tid);
    const assistant = getAssistantConfig(tid, effectiveAssistantId);
    const orderFlowEnabled = config.features?.orderFlowEnabled === true;
    // Se o agente tem roteamento ativo (ex.: Atendente → Vendedor), pedidos de compra devem ir para a IA para ela transferir, não para o fluxo de pedido global
    const hasHandoffRoutes = !!(assistant.handoffRules?.enabled && assistant.handoffRules.routes?.length);
    if (hasHandoffRoutes && (intent === 'START_ORDER' || intent === 'START_ORDER_WITH_QUANTITY')) {
        intent = 'UNKNOWN';
    }

    if (history && Array.isArray(history) && history.length === 0) {
        session.history = [];
        session.order = createOrderSession();
        session.lastProduct = null;
        await currentAgentStore.clear(tid, phone);
    }

    console.log(`\n[CHAT] [${phone}] >> "${message}" | Intent: ${intent} | OrderState: ${session.order.state}`);

    let reply: string;
    let debug: any = null;
    let handledByLLM = false;

    if (orderFlowEnabled && session.order.state !== 'idle' && intent !== 'STOCK_QUERY') {
        const result = await processOrderFlow(message, session.order, intent, tid);
        reply = result.reply;
        session.order = result.newState;
    } else if (orderFlowEnabled && (intent === 'START_ORDER' || intent === 'START_ORDER_WITH_QUANTITY')) {
        if (session.lastProduct) {
            session.order.product = session.lastProduct;
        }
        const result = await processOrderFlow(message, session.order, intent, tid);
        reply = result.reply;
        session.order = result.newState;
    } else if (intent === 'HUMAN_AGENT') {
        try {
            reply = (config.prompt.humanAgentMessage && config.prompt.humanAgentMessage.trim()) || 'Vou transferir você para um de nossos atendentes. Um momento, por favor!';
        } catch {
            reply = 'Vou transferir você para um de nossos atendentes. Um momento, por favor!';
        }
    } else if (intent === 'GREETING') {
        try {
            const assistantName = assistant.name || 'Assistente';
            const companyName = config.branding?.companyName || 'a empresa';
            const template = (config.prompt.greeting && config.prompt.greeting.trim()) || 'Olá! Sou a {{assistantName}}, assistente virtual. Como posso ajudar hoje?';
            reply = template
                .replace(/\{\{assistantName\}\}/g, assistantName)
                .replace(/\{\{companyName\}\}/g, companyName);
        } catch {
            reply = 'Olá! Sou a Assistente, assistente virtual. Como posso ajudar hoje?';
        }
    } else {
        const result = await getAIResponse(tid, message, session.history, effectiveAssistantId);
        const fallbackReply = 'Desculpe, não consegui processar sua solicitação. Pode reformular?';
        // Em transferência: nunca mostrar fallback genérico; usar mensagem de transição
        if (result.handoff?.transitionMessage?.trim()) {
            reply = (result.content?.trim()) || result.handoff.transitionMessage.trim();
        } else {
            reply = result.content?.trim() || fallbackReply;
        }
        debug = result.messages;
        handledByLLM = true;

        const clean = result.messages.filter((m: any) => m.role !== 'system');
        session.history = clean.slice(-20);

        if (result.toolResults && result.toolResults.length > 0) {
            try {
                const lastToolContent = result.toolResults[result.toolResults.length - 1].content;
                const products = JSON.parse(lastToolContent);
                if (Array.isArray(products) && products.length > 0) {
                    session.lastProduct = products[0];
                    console.log(`[CHAT] Produto salvo para order flow: ${products[0].nome}`);
                }
            } catch {
                /* ignore */
            }
        }

        // Propaga handoff para o caller (frontend / webhook handler)
        let handoffToReturn: HandoffInfo | null = result.handoff ?? null;
        if (!handoffToReturn && assistant.handoffRules?.enabled && assistant.handoffRules.routes?.length && replyLooksLikeTransfer(reply)) {
            // Fallback: IA disse que ia transferir mas não chamou a tool — acionamos a transferência mesmo assim
            const routes = assistant.handoffRules.routes;
            const rLower = reply.toLowerCase();
            const matched = routes.find((route) => {
                const label = (route.label || '').toLowerCase();
                const id = (route.agentId || '').toLowerCase();
                return (label && rLower.includes(label)) || (id && rLower.includes(id)) ||
                    (rLower.includes('vendas') && (id === 'vendedor' || label.includes('vendedor') || label.includes('vendas'))) ||
                    (rLower.includes('vendedor') && (id === 'vendedor' || label.includes('vendedor')));
            });
            const route = matched ?? routes[0];
            handoffToReturn = { targetAgentId: route.agentId, transitionMessage: reply };
            console.log(`[CHAT] HANDOFF (fallback): agente "${effectiveAssistantId}" → "${route.agentId}" (resposta indicou transferência sem tool)`);
        }
        if (!handoffToReturn && reply === fallbackReply && hasHandoffRoutes && userMessageIsConfirmation(message) && lastAssistantAskedTransferConfirmation(session.history)) {
            // Fallback: usuário confirmou ("sim"/"pode") e a última mensagem do bot pediu confirmação de transferência, mas a IA não chamou a tool
            const routes = assistant.handoffRules!.routes!;
            const route = routes.find((r) => /vendedor|vendas|comercial/i.test(r.agentId || '') || /vendedor|vendas|comercial/i.test(r.label || '')) ?? routes[0];
            const transitionMessage = `Vou te encaminhar para nosso setor de vendas. Um momento!`;
            handoffToReturn = { targetAgentId: route.agentId, transitionMessage };
            reply = transitionMessage;
            console.log(`[CHAT] HANDOFF (fallback confirmação): usuário confirmou, agente "${effectiveAssistantId}" → "${route.agentId}"`);
        }
        if (handoffToReturn) {
            const targetId = handoffToReturn.targetAgentId.trim().toLowerCase();
            await currentAgentStore.set(tid, phone, targetId);
            if (!handledByLLM && reply) {
                session.history.push({ role: 'user', content: message });
                session.history.push({ role: 'assistant', content: reply });
                session.history = session.history.slice(-20);
            }
            await sessionStore.set?.(tid, phone, session, effectiveAssistantId);

            // Gera primeira mensagem do agente de destino com contexto da transferência (conversa ativa)
            let initialReply: string | undefined;
            try {
                const contextMessage = `[Transferência] O cliente foi encaminhado para você. O que o cliente disse: "${message}". A mensagem que o atendente anterior enviou ao cliente ao transferir: "${reply}". Responda com UMA única mensagem de boas-vindas e já comece a atender o cliente de forma ativa (ex.: perguntando como pode ajudar com o pedido ou o que precisa). Não repita que está transferindo; assuma que o cliente já está com você.`;
                const newAgentResult = await getAIResponse(tid, contextMessage, [], targetId);
                initialReply = (newAgentResult.content || '').trim() || undefined;
                if (initialReply) {
                    const newAgentSession = await sessionStore.get(tid, phone, targetId);
                    newAgentSession.history = [
                        { role: 'user' as const, content: message },
                        { role: 'assistant' as const, content: initialReply },
                    ];
                    await sessionStore.set?.(tid, phone, newAgentSession, targetId);
                    console.log(`[CHAT] Initial reply do agente "${targetId}": ${initialReply.substring(0, 60)}...`);
                }
            } catch (err: any) {
                console.warn('[CHAT] Erro ao gerar initialReply do agente de destino:', err?.message);
            }

            return {
                reply,
                debug,
                handoff: {
                    targetAgentId: targetId,
                    transitionMessage: handoffToReturn.transitionMessage,
                    ...(initialReply ? { initialReply } : {}),
                },
                effectiveAssistantId: targetId,
            };
        }
    }

    if (!handledByLLM && reply) {
        session.history.push({ role: 'user', content: message });
        session.history.push({ role: 'assistant', content: reply });
        session.history = session.history.slice(-20);
    }

    const logPreview = reply.length > 80 ? `${reply.substring(0, 80)} (truncado no log)` : reply;
    console.log(`[CHAT] [${phone}] << "${logPreview}"`);

    await sessionStore.set?.(tid, phone, session, effectiveAssistantId);
    return { reply, debug, effectiveAssistantId: effectiveAssistantId ?? null };
}
