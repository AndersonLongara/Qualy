/**
 * Lógica reutilizável de processamento de mensagem de chat.
 * Usada por POST /api/chat e pelo webhook de mensageria (C13).
 * Multi-tenant (M1): tenantId identifica o cliente; sessão e config são por tenant.
 */
import axios from 'axios';
import { getConfig, getAssistantConfig } from '../../config/tenant';
import { detectIntent, detectTone, messageContainsProductCode, messageContainsProductName } from '../ai/intent';
import { createOrderSession, processOrderFlow } from '../ai/order-flow';
import { getAIResponse } from '../ai/provider';
import { sessionStore, currentAgentStore, sharedContextStore } from '../../mock/sessionStore';

export interface HandoffInfo {
    /** ID do agente de destino para onde o cliente foi transferido. */
    targetAgentId: string;
    /** Mensagem de transição gerada pelo agente de origem (já incluída no reply). */
    transitionMessage: string;
    /** Primeira mensagem do agente de destino já com o contexto da transferência (conversa ativa). */
    initialReply?: string;
}

export interface HumanEscalationInfo {
    /** Motivo da escalação fornecido pela IA. */
    motivo: string;
    /** true se o webhook de escalação foi disparado. */
    webhookFired: boolean;
}

export interface ProcessChatResult {
    reply: string;
    debug?: any;
    /** Presente quando o agente atual transferiu o atendimento para outro agente. */
    handoff?: HandoffInfo | null;
    /** Presente quando houve escalação para atendente humano (via intent ou via tool da IA). */
    humanEscalation?: HumanEscalationInfo | null;
    /** ID do agente efetivamente usado (pode ser o persistido após handoff). Para log e sincronia com o cliente. */
    effectiveAssistantId?: string | null;
}

const DEFAULT_TENANT = 'default';

/**
 * Chama o webhook de escalação humana (fire-and-forget).
 * Envia tenantId, phone, message e timestamp ao endpoint configurado.
 */
async function fireHumanEscalationWebhook(
    webhookUrl: string,
    method: 'GET' | 'POST',
    tenantId: string,
    phone: string,
    message: string
): Promise<void> {
    try {
        const payload = { tenantId, phone, message, timestamp: new Date().toISOString(), event: 'human_escalation' };
        if (method === 'GET') {
            await axios.get(webhookUrl, { params: payload, timeout: 10000 });
        } else {
            await axios.post(webhookUrl, payload, { timeout: 10000 });
        }
        console.log(`[ESCALATION] Webhook chamado: ${method} ${webhookUrl}`);
    } catch (err: any) {
        console.warn(`[ESCALATION] Falha no webhook ${webhookUrl}:`, err?.message);
    }
}

/** Indica se o texto da resposta parece uma mensagem de transferência efetiva (não apenas pedido de confirmação). */
function replyLooksLikeTransfer(reply: string): boolean {
    const r = (reply || '').trim().toLowerCase();
    const askingConfirmation = /\b(pode ser\??|posso te (encaminhar|transferir)\??|aguardo (sua )?confirmação|quer que eu transfira|posso transferir)\b/i.test(r);
    if (askingConfirmation) return false;
    const hasTransferVerb = /\b(encaminhar|transferir|direcionar|te direciono|vou te (encaminhar|transferir|direcionar)|encaminho)\b/i.test(r);
    const hasTarget = /\b(setor|agente|especialista|atendente|departamento|equipe|responsável)\b/i.test(r); // genérico
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
 * Tenta encontrar o produto mencionado na mensagem dentro da lista de produtos recentes.
 * Usa correspondência por palavras-chave (ignora stop-words curtas e acento).
 */
function findProductByMention(message: string, products: any[]): any | null {
    if (!products || products.length === 0) return null;
    const normalize = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const msgNorm = normalize(message);
    let best: any = null;
    let bestScore = 0;
    for (const p of products) {
        const words = normalize(p.nome || '').split(/\s+/).filter((w: string) => w.length > 3);
        const score = words.filter((w: string) => msgNorm.includes(w)).length;
        if (score > bestScore) { bestScore = score; best = p; }
    }
    return bestScore >= 1 ? best : null;
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

    // P1+P2: merge shared context (cross-agent customerProfile + tone)
    const sharedCtx = await sharedContextStore.get(tid, phone);
    if (sharedCtx.customerProfile && !session.customerProfile) session.customerProfile = sharedCtx.customerProfile;
    if (sharedCtx.tone && !session.tone) session.tone = sharedCtx.tone;
    let intent = detectIntent(message);
    // Garante que pedidos explícitos de transferência sempre vão para a IA (tool transferir_para_agente)
    if (intent === 'HUMAN_AGENT' && /\btransferir\b/i.test(message.trim())) {
        intent = 'UNKNOWN';
    }
    const config = getConfig(tid);
    const assistant = getAssistantConfig(tid, effectiveAssistantId);
    const orderFlowEnabled = config.features?.orderFlowEnabled === true;
    // Se o agente tem roteamento ativo (ex.: Atendente → Vendedor), pedidos de compra devem ir para a IA para ela transferir, não para o fluxo de pedido global
    // Exceção: se o próprio agente tem ferramentas de vendas (consultar_estoque / pedido_post), ele É o agente de vendas e deve processar os pedidos normalmente.
    const agentToolIds = assistant.toolIds ?? [];
    const agentHasSalesTools = agentToolIds.some((t: string) => ['consultar_estoque', 'pedido_post'].includes(t));
    const hasHandoffRoutes = !!(assistant.handoffRules?.enabled && assistant.handoffRules.routes?.length);
    if (hasHandoffRoutes && !agentHasSalesTools && (intent === 'START_ORDER' || intent === 'START_ORDER_WITH_QUANTITY')) {
        intent = 'UNKNOWN';
    }
    // Se a mensagem já traz código ou nome de produto (ex.: "CIM-001" ou "produto Cimento CP-II 50kg"), manda para a IA para ela consultar estoque em vez do fluxo que pediria "qual produto?"
    if ((intent === 'START_ORDER' || intent === 'START_ORDER_WITH_QUANTITY') && (messageContainsProductCode(message) || messageContainsProductName(message))) {
        intent = 'UNKNOWN';
    }

    if (history && Array.isArray(history) && history.length === 0) {
        session.history = [];
        session.order = createOrderSession();
        session.lastProduct = null;
        session.lastProducts = [];
        // Keep customerProfile and tone across conversation resets
        await currentAgentStore.clear(tid, phone);
    }

    console.log(`\n[CHAT] [${phone}] >> "${message}" | Intent: ${intent} | OrderState: ${session.order.state}`);

    let reply: string;
    let debug: any = null;
    let handledByLLM = false;

    if (orderFlowEnabled && session.order.state !== 'idle' && intent !== 'STOCK_QUERY') {
        // When adding more items to cart, sync the newly-found product into the order session
        if (session.order.state === 'awaiting_more_or_checkout' &&
            (intent === 'START_ORDER' || intent === 'START_ORDER_WITH_QUANTITY')) {
            const matched = findProductByMention(message, session.lastProducts);
            session.order.product = matched ?? session.lastProduct ?? null;
            if (matched) console.log(`[CHAT] Produto encontrado por nome: ${matched.nome}`);
        }
        const priorOrderState = { ...session.order };
        const result = await processOrderFlow(message, session.order, intent, tid, effectiveAssistantId ?? undefined);
        reply = result.reply;
        session.order = result.newState;
        // P1: capture customerProfile from any validated order state
        const name = result.newState.customerName ?? priorOrderState.customerName;
        const doc = result.newState.document ?? priorOrderState.document;
        if (name && doc) session.customerProfile = { name, document: doc };
    } else if (orderFlowEnabled && (intent === 'START_ORDER' || intent === 'START_ORDER_WITH_QUANTITY')) {
        const matched = findProductByMention(message, session.lastProducts);
        session.order.product = matched ?? session.lastProduct ?? null;
        if (matched) console.log(`[CHAT] Produto encontrado por nome: ${matched.nome}`);
        else if (session.lastProduct) console.log(`[CHAT] Usando lastProduct fallback: ${session.lastProduct.nome}`);
        const priorOrderState = { ...session.order };
        const result = await processOrderFlow(message, session.order, intent, tid, effectiveAssistantId ?? undefined);
        reply = result.reply;
        session.order = result.newState;
        // P1: capture customerProfile from any validated order state
        const name = result.newState.customerName ?? priorOrderState.customerName;
        const doc = result.newState.document ?? priorOrderState.document;
        if (name && doc) session.customerProfile = { name, document: doc };
    } else if (intent === 'HUMAN_AGENT') {
        const escalation = config.chatFlow?.humanEscalation;
        const legacyMsg = config.prompt.humanAgentMessage?.trim();
        let webhookFired = false;
        if (escalation?.enabled) {
            reply = escalation.message?.trim() || legacyMsg || 'Vou transferir você para um de nossos atendentes. Um momento, por favor!';
            if (escalation.webhookUrl?.trim()) {
                fireHumanEscalationWebhook(escalation.webhookUrl.trim(), escalation.method || 'POST', tid, phone, message);
                webhookFired = true;
            }
        } else {
            reply = legacyMsg || 'Vou transferir você para um de nossos atendentes. Um momento, por favor!';
        }
        session.history.push({ role: 'user', content: message });
        session.history.push({ role: 'assistant', content: reply });
        session.history = session.history.slice(-20);
        await sessionStore.set?.(tid, phone, session, effectiveAssistantId);
        return {
            reply,
            debug: null,
            humanEscalation: { motivo: 'Solicitação direta do cliente (intent HUMAN_AGENT)', webhookFired },
            effectiveAssistantId: effectiveAssistantId ?? null,
        };
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
        const result = await getAIResponse(tid, message, session.history, effectiveAssistantId, {
            customerProfile: session.customerProfile ?? undefined,
            tone: session.tone ?? undefined,
        });
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

        // P2: Detect and update tone from recent user messages
        const recentUserMsgs = session.history
            .filter((m: any) => m.role === 'user')
            .slice(-4)
            .map((m: any) => (typeof m.content === 'string' ? m.content : ''));
        recentUserMsgs.push(message);
        const detectedTone = detectTone(recentUserMsgs);
        if (detectedTone) session.tone = detectedTone;

        if (result.toolResults && result.toolResults.length > 0) {
            try {
                const lastToolContent = result.toolResults[result.toolResults.length - 1].content;
                const products = JSON.parse(lastToolContent);
                if (Array.isArray(products) && products.length > 0) {
                    session.lastProducts = products;
                    session.lastProduct = products[0];
                    console.log(`[CHAT] ${products.length} produto(s) salvos para order flow. Primeiro: ${products[0].nome}`);
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
                // Procura na resposta se a IA mencionou o label ou o id configurado para esta rota.
                return (label && rLower.includes(label)) || (id && rLower.includes(id));
            });
            const route = matched ?? routes[0]; // vai pro primeiro se não achar exato
            handoffToReturn = { targetAgentId: route.agentId, transitionMessage: reply };
            console.log(`[CHAT] HANDOFF (fallback): agente "${effectiveAssistantId}" → "${route.agentId}" (resposta indicou transferência sem tool)`);
        }
        if (!handoffToReturn && reply === fallbackReply && hasHandoffRoutes && userMessageIsConfirmation(message) && lastAssistantAskedTransferConfirmation(session.history)) {
            // Fallback: usuário confirmou ("sim"/"pode") e a última mensagem do bot pediu confirmação de transferência, mas a IA não chamou a tool
            const routes = assistant.handoffRules!.routes!;
            const route = routes[0]; // Sem mais tentativa de adivinhar 'vendas', ir para a rota padrão primária
            const transitionMessage = `Vou te encaminhar de acordo com sua solicitação. Um momento!`;
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
                // P4: Pass recent history + shared context so target agent has full picture
                const transferContext = session.history.slice(-6);
                const contextMessage = `[Transferência] O cliente foi encaminhado para você.${
                    session.customerProfile ? ` Cliente: ${session.customerProfile.name} (doc: ${session.customerProfile.document}).` : ''
                } O cliente disse: "${message}". Responda com UMA única mensagem assumindo o contexto anterior — já comece a atender, sem anunciar transferência.`;
                const newAgentResult = await getAIResponse(tid, contextMessage, transferContext, targetId, {
                    customerProfile: session.customerProfile ?? undefined,
                    tone: session.tone ?? undefined,
                });
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

        // Escalação humana via tool da IA
        if (result.humanEscalation) {
            const escalation = config.chatFlow?.humanEscalation;
            let webhookFired = false;
            if (escalation?.enabled && escalation.webhookUrl?.trim()) {
                fireHumanEscalationWebhook(escalation.webhookUrl.trim(), escalation.method || 'POST', tid, phone, message);
                webhookFired = true;
            }
            if (!handledByLLM && reply) {
                session.history.push({ role: 'user', content: message });
                session.history.push({ role: 'assistant', content: reply });
                session.history = session.history.slice(-20);
            }
            await sessionStore.set?.(tid, phone, session, effectiveAssistantId);
            return {
                reply,
                debug,
                humanEscalation: { motivo: result.humanEscalation.motivo, webhookFired },
                effectiveAssistantId: effectiveAssistantId ?? null,
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

    // P1+P2: persist shared context cross-agent
    if (session.customerProfile || session.tone) {
        await sharedContextStore.set(tid, phone, {
            customerProfile: session.customerProfile,
            tone: session.tone,
        });
    }

    await sessionStore.set?.(tid, phone, session, effectiveAssistantId);
    return { reply, debug, effectiveAssistantId: effectiveAssistantId ?? null };
}
