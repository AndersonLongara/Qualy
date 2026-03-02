import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { getConfig, getAssistantConfig, type ResolvedAssistant, type ToolConfig } from '../../config/tenant';
import { usageStore } from '../../mock/usageStore';
import { toolsDefinition, toolsExecution, buildHandoffToolDefinition, buildHumanEscalationToolDefinition, getBuiltinToolsConfig, executeTool } from './tools';

dotenv.config({ path: '.env.local' });
dotenv.config();

// Remove qualquer espaço/quebra de linha da chave (evita "is not a legal HTTP header value" na Vercel)
function sanitizeApiKey(raw: string | undefined): string | undefined {
    if (raw == null || typeof raw !== 'string') return undefined;
    const s = raw.replace(/\s/g, '');
    return s.length > 0 ? s : undefined;
}
const OPENROUTER_API_KEY = sanitizeApiKey(process.env.OPENROUTER_API_KEY);
const OPENROUTER_MODEL = (process.env.OPENROUTER_MODEL ?? '').trim() || 'google/gemini-2.5-flash-lite';

if (!OPENROUTER_API_KEY) {
    console.warn('⚠️ OPENROUTER_API_KEY não encontrada. O AI Engine não funcionará corretamente.');
}

// Cliente OpenRouter: timeout alto e retries para ambiente serverless (Vercel); evita "Connection error" por timeout/cold start.
const OPENROUTER_TIMEOUT_MS = 25000;
const OPENROUTER_MAX_RETRIES = 2;

function createOpenAIClient(tenantId?: string, assistantName?: string | null) {
    const config = getConfig(tenantId);
    const title = assistantName?.trim() || config.branding.assistantName || 'AltraFlow Assistant';
    return new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: OPENROUTER_API_KEY,
        timeout: OPENROUTER_TIMEOUT_MS,
        maxRetries: OPENROUTER_MAX_RETRIES,
        defaultHeaders: {
            'HTTP-Referer': 'https://altraflow.com',
            'X-Title': title,
        },
    });
}

/** Corrige glitches onde o modelo insere caracteres de outros idiomas (ex.: 確認 no meio de "confirmarmos"). */
function sanitizeResponseForPortuguese(text: string): string {
    if (!text || typeof text !== 'string') return text;
    let out = text
        .replace(/\u78ba\u8a8d/g, 'confirmar')
        .replace(/\u786e\u8ba4/g, 'confirmar')
        .replace(/\u30ab\u30a6\u30f3\u30c8/g, 'contar')
        .replace(/\u30c1\u30a7\u30c3\u30af/g, 'verificar');
    out = out.replace(/[\u3000-\u303f\u4e00-\u9faf\u3400-\u4dbf\uff00-\uffef\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g, '');
    return out.replace(/\s{2,}/g, ' ').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// System Prompt — por config (C3/C6): path → string → fallback SYSTEM_PROMPT.md
// ─────────────────────────────────────────────────────────────────────────────
const defaultPromptPath = path.resolve(__dirname, 'SYSTEM_PROMPT.md');
const defaultPromptFallback = 'Você é a AltraFlow, assistente virtual.';

export function getSystemPrompt(config: ReturnType<typeof getConfig>): string {
    const cwd = process.cwd();
    if (config.prompt.systemPromptPath && config.prompt.systemPromptPath.trim()) {
        try {
            const fullPath = path.isAbsolute(config.prompt.systemPromptPath)
                ? config.prompt.systemPromptPath
                : path.join(cwd, config.prompt.systemPromptPath);
            const content = fs.readFileSync(fullPath, 'utf8').trim();
            if (content.length > 0) return content;
        } catch (err) {
            console.warn('[config] Aviso: não foi possível ler prompt de', config.prompt.systemPromptPath, (err as Error).message);
        }
    }
    if (config.prompt.systemPrompt && config.prompt.systemPrompt.trim()) {
        return config.prompt.systemPrompt.trim();
    }
    try {
        const content = fs.readFileSync(defaultPromptPath, 'utf8').trim();
        return content || defaultPromptFallback;
    } catch {
        return defaultPromptFallback;
    }
}

/** Ferramentas que exigem CPF/CNPJ ou operações financeiras. Só são passadas à IA quando features.financialEnabled é true. */
const FINANCIAL_TOOL_NAMES = new Set(['consultar_cliente', 'consultar_titulos', 'consultar_pedidos']);
/** Ferramenta de estoque/pedido. Só é passada quando features.orderFlowEnabled é true. */
const ORDER_TOOL_NAMES = new Set(['consultar_estoque']);

type ToolDefinition = (typeof toolsDefinition)[number] | ReturnType<typeof buildHandoffToolDefinition> | ReturnType<typeof buildHumanEscalationToolDefinition>;

function toolConfigToOpenAIDef(tool: ToolConfig): ToolDefinition {
    return {
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
        },
    } as ToolDefinition;
}

export interface EffectiveToolsResult {
    definitions: ToolDefinition[];
    executionMap: Record<string, (args: Record<string, unknown>) => Promise<string>>;
}

function getEffectiveTools(
    tenantId: string,
    assistantId: string | null,
    features: { financialEnabled: boolean; orderFlowEnabled: boolean },
    assistant: ResolvedAssistant,
    tenantConfig: ReturnType<typeof getConfig>
): EffectiveToolsResult {
    const executionMap: Record<string, (args: Record<string, unknown>) => Promise<string>> = {};

    const humanEscalationEnabled = tenantConfig.chatFlow?.humanEscalation?.enabled === true;

    if (assistant.toolIds && assistant.toolIds.length > 0) {
        const builtins = getBuiltinToolsConfig();
        const custom = tenantConfig.tools || [];
        const allTools = [...builtins, ...custom];
        const definitions: ToolDefinition[] = [];
        for (const id of assistant.toolIds) {
            const tool = allTools.find((t) => t.id === id);
            if (!tool) continue;
            definitions.push(toolConfigToOpenAIDef(tool));
            executionMap[tool.name] = (args) => executeTool(tenantId, assistantId, tool, args);
        }
        if (assistant.handoffRules?.enabled && assistant.handoffRules.routes.length > 0) {
            definitions.push(buildHandoffToolDefinition(assistant.handoffRules.routes));
            executionMap['transferir_para_agente'] = (args) =>
                toolsExecution['transferir_para_agente'](tenantId, assistantId, args);
        }
        if (humanEscalationEnabled) {
            definitions.push(buildHumanEscalationToolDefinition());
            executionMap['solicitar_atendente_humano'] = (args) =>
                toolsExecution['solicitar_atendente_humano'](tenantId, assistantId, args);
        }
        return { definitions, executionMap };
    }

    const financial = features.financialEnabled === true;
    const order = features.orderFlowEnabled === true;
    const base: ToolDefinition[] = toolsDefinition.filter((t) => {
        const name = (t as any).function?.name as string | undefined;
        if (!name) return false;
        if (!financial && FINANCIAL_TOOL_NAMES.has(name)) return false;
        if (!order && ORDER_TOOL_NAMES.has(name)) return false;
        return true;
    });
    if (assistant.handoffRules?.enabled && assistant.handoffRules.routes.length > 0) {
        base.push(buildHandoffToolDefinition(assistant.handoffRules.routes));
    }
    if (humanEscalationEnabled) {
        base.push(buildHumanEscalationToolDefinition());
    }
    for (const t of base) {
        const name = (t as any).function?.name as string;
        if (name) executionMap[name] = (args) => toolsExecution[name](tenantId, assistantId, args);
    }
    return { definitions: base, executionMap };
}

/** Optional session context injected into the system prompt at runtime */
export interface SessionContext {
    customerProfile?: { name: string; document: string };
    tone?: 'formal' | 'informal';
}

/** System prompt a partir de ResolvedAssistant (path ou texto); fallback para tenant prompt ou default. */
function getSystemPromptFromAssistant(
    assistant: ResolvedAssistant,
    tenantConfig: ReturnType<typeof getConfig>,
    cwd: string,
    ctx?: SessionContext
): string {
    let content = '';
    if (assistant.systemPromptPath && assistant.systemPromptPath.trim()) {
        try {
            const fullPath = path.isAbsolute(assistant.systemPromptPath)
                ? assistant.systemPromptPath
                : path.join(cwd, assistant.systemPromptPath);
            content = fs.readFileSync(fullPath, 'utf8').trim();
        } catch (err) {
            console.warn('[config] Aviso: não foi possível ler prompt do assistente', assistant.systemPromptPath, (err as Error).message);
        }
    }
    if (!content && assistant.systemPrompt && assistant.systemPrompt.trim()) {
        content = assistant.systemPrompt.trim();
    }
    if (!content) {
        content = getSystemPrompt(tenantConfig);
    }
    const companyName = tenantConfig.branding?.companyName || 'a empresa';
    const assistantName = assistant.name || 'Assistente';
    const isVendedor = assistant.id === 'vendedor' || (assistant.features?.orderFlowEnabled && !assistant.handoffRules?.enabled);
    const strictPrefix = `# IDENTIDADE E REGRAS OBRIGATÓRIAS
Você é ${assistantName}, assistente da ${companyName}. Siga estritamente as instruções e o tom definidos abaixo. Não invente informações que não estejam nas instruções.
${isVendedor ? '- **Saudações:** Apresente-se sempre como **Vendedor** ou setor de vendas (ex.: "Sou o Vendedor", "setor de vendas"). Nunca diga que é Atendente.\n' : ''}- **Idioma:** Responda SEMPRE exclusivamente em português do Brasil. Não use palavras, caracteres, ideogramas ou símbolos de outros idiomas (nada de inglês, japonês, chinês, etc. no meio do texto).

---
`;
    let fullPrompt = strictPrefix + content;

    // Agentes vendedores (isVendedor = orderFlowEnabled sem handoff): injeta regras de fluxo de venda
    if (isVendedor) {
        fullPrompt += `

---
# FLUXO DE ESTOQUE E VENDAS (OBRIGATÓRIO — NÃO IGNORE)

## Regra de ouro: SEARCH FIRST, PERGUNTE DEPOIS
Quando o cliente mencionar qualquer produto (nome, marca, categoria, descrição):
1. **Chame IMEDIATAMENTE a ferramenta \`consultar_estoque\`** com o termo que o cliente usou — **sem fazer nenhuma pergunta antes**.
2. **Exiba TODOS os resultados** usando EXATAMENTE este formato para cada item (um bloco separado por linha em branco):

*[número].* *[Nome completo do produto]*
🔖 SKU: \`[sku]\`
💰 Preço: R$ [preço] *(ou R$ [promo] com desconto, se houver)*
📦 Disponível: [quantidade] unidades

3. Após listar todos os itens, finalize com uma linha em branco e depois: *"Qual desses você deseja?"*

Regras de formatação:
- Cada produto deve ser um bloco separado (linha em branco entre eles)
- Nunca coloque dois produtos na mesma linha
- Não use traços (—) nem colchetes no texto final enviado ao cliente
- Se houver apenas 1 resultado, mostre ele normalmente e pergunte a quantidade diretamente

## Se não encontrar nada:
- Tente o mesmo termo com menos palavras (ex: "Ração Royal" → "Royal")
- Se ainda não encontrar, informe que não tem em estoque e pergunte se deseja algo parecido.

## Nunca faça antes de pesquisar:
- ❌ Não pergunte tipo de pet, porte, peso, raça, marca preferida
- ❌ Não peça mais detalhes antes de chamar \`consultar_estoque\`
- ❌ Não diga "não encontrei" sem ter chamado a ferramenta antes

## NUNCA faça em nenhuma hipótese:
- ❌ Não peça CPF/CNPJ — o sistema pede automaticamente na hora certa
- ❌ Não confirme pedidos, não diga "pedido confirmado", não pergunte forma de pagamento
- ❌ Não diga "vou registrar seu pedido" ou qualquer variação — o sistema faz isso
- ✅ Após o cliente informar a quantidade, apenas aguarde — o sistema assumirá o controle

## Após o cliente escolher um produto:
- Pergunte a quantidade desejada.
- O sistema adicionará o item ao carrinho automaticamente.
- Depois, pergunte se o cliente quer **adicionar mais produtos** ou **finalizar o pedido**.
- Se quiser mais: pesquise o próximo produto com \`consultar_estoque\` (mesmo fluxo).
- Quando finalizar: solicite o CNPJ/CPF, depois confirme o pedido com resumo de TODOS os itens e total.

## Carrinho multi-produto:
- O cliente pode adicionar quantos produtos quiser antes de fechar o pedido.
- O CNPJ/CPF é pedido UMA VEZ, apenas ao finalizar, não a cada produto.`;
    }

    //  Agentes com roteamento ativo: não pedir CPF/CNPJ para pedido — transferir para o agente correto
    if (assistant.handoffRules?.enabled && assistant.handoffRules.routes?.length) {
        const routes = assistant.handoffRules.routes;
        const availableTargets = routes.map(r => `**${r.label || r.agentId}**`).join(', ');

        fullPrompt += `

---
# ROTEAMENTO (OBRIGATÓRIO — FLUXO HUMANO / ESPECIALIZADO)
Você tem a capacidade de transferir o atendimento para outros setores/agentes.
Destinos disponíveis configurados para você: ${availableTargets}.

Quando o cliente demonstrar intenção relacionada a assuntos que não são de sua especialidade ou que deixam claro que ele precisa de um dos destinos acima:
- **Reconheça só a intenção** e **ofereça a transferência** para o respectivo setor. NÃO faça perguntas aprofundadas sobre o assunto do destino (ex.: se for para vendas, não pergunte qual produto; se for para financeiro, não peça dados de boleto). Sua única ação é indicar que vai transferir e perguntar se pode transferir.
- **NÃO** peça CPF/CNPJ nem execute consultas a não ser que seja exclusivamente do seu próprio escopo.
- **Primeiro** mensagem curta: informe que vai conectar o cliente ao especialista certo — use linguagem natural e discreta (ex.: "Deixa eu te conectar com quem pode ajudar melhor nisso, ok?" ou "Vou te passar pro setor certo, um segundinho!"). **NÃO chame a ferramenta de transferência nesta mensagem** — apenas aguarde a confirmação do cliente.
- **Só depois** que o cliente **confirmar** (sim, pode, ok, claro, pode ser, etc.) você **DEVE** chamar a ferramenta **transferir_para_agente**. O agente de destino é quem fará as perguntas específicas.
- Se a última mensagem que você enviou foi pedir confirmação e o cliente respondeu **apenas** "sim", "pode", "ok" ou "claro", **chame imediatamente** a ferramenta **transferir_para_agente** com o ID correto do agente oferecido — não responda só com texto.
- **Mensagem de transição:** Ao chamar a tool, gere em \`mensagem_transicao\` uma frase curta e natural — **não mencione "transferência", "setor" ou "encaminhamento"** explicitamente. Ex.: "Perfeito! Já deixo você com a pessoa certa. 👋"
- **Não repita saudação:** Se já existe conversa anterior, NÃO diga "Olá" ou "Bom dia" de novo. Vá direto ao ponto.`;
    }

    // ── Context blocks: customer profile, tone, proactivity ──
    if (ctx?.customerProfile) {
        const firstName = ctx.customerProfile.name.split(' ')[0];
        fullPrompt += `

---
# CONTEXTO DO CLIENTE ATUAL
- **Nome completo:** ${ctx.customerProfile.name} (doc: ${ctx.customerProfile.document})
- **Primeiro nome:** ${firstName}
- Use o primeiro nome (**${firstName}**) naturalmente em 1-2 momentos da conversa (cumprimento e/ou confirmação). Não repita demais.
- Se o cliente perguntar seu nome anterior ou histórico, pode perguntar: "Quer ver seus pedidos anteriores?" e chamar a ferramenta \`consultar_pedidos\` com o documento acima.`;
    }
    if (ctx?.tone === 'informal') {
        fullPrompt += `

---
# TOM DE COMUNICAÇÃO: INFORMAL
O cliente escreve de forma INFORMAL. Adapte-se:
- Tuteia ("você" pode ser abreviado, use "tudo bem?", "pode ser!")
- Seja mais descontraído, mas ainda profissional
- Evite formalidades excessivas como "prezado" ou "solicito"
- Respostas mais curtas e diretas`;
    } else if (ctx?.tone === 'formal') {
        fullPrompt += `

---
# TOM DE COMUNICAÇÃO: FORMAL
O cliente escreve de forma FORMAL. Mantenha:
- Tratamento em "você" com respeito
- Frases completas com pontuação adequada
- Evite gírias, contrações ou abreviações
- Seja preciso e profissional`;
    }
    if (isVendedor) {
        fullPrompt += `

---
# PROATIVIDADE (quando aplicável)
- Se um produto tiver o campo \`_alerta\` no resultado do estoque, mencione o aviso diretamente ao cliente (ex.: "⚠️ últimas 3 unidades — corre!").
- Se \`consultar_pedidos\` retornar histórico do cliente, mencione: "Da última vez você levou [produto], quer adicionar de novo?"
- Nunca invente histórico — só mencione se a ferramenta retornar dados reais.`;
    }

    return fullPrompt;
}

export const getAIResponse = async (
    tenantId: string,
    userMessage: string,
    history: Array<any> = [],
    assistantId?: string | null,
    ctx?: SessionContext
) => {
    const tid = tenantId?.trim() || 'default';
    const config = getConfig(tid);
    const assistant = getAssistantConfig(tid, assistantId);
    const cwd = process.cwd();
    const systemPrompt = getSystemPromptFromAssistant(assistant, config, cwd, ctx);
    const openai = createOpenAIClient(tid, assistant.name);
    const model = (assistant.model && assistant.model.trim()) || OPENROUTER_MODEL;

    const messages: any[] = [
        { role: "system", content: systemPrompt },
        ...history.filter(m => m.role !== 'system'),
        { role: "user", content: userMessage }
    ];

    if (!OPENROUTER_API_KEY || !OPENROUTER_API_KEY.trim()) {
        console.error('[AI] OPENROUTER_API_KEY não configurada. Defina no .env.local ou nas variáveis de ambiente da Vercel.');
        return {
            content: "O agente não está configurado (chave de API ausente). Configure OPENROUTER_API_KEY no servidor e tente novamente.",
            messages: history,
            toolResults: [],
            handoff: null,
            humanEscalation: null,
        };
    }

    try {
        console.log(`[AI] Enviando para OpenRouter (${model})...`);

        const temperature = typeof assistant.temperature === 'number' && !Number.isNaN(assistant.temperature)
            ? Math.max(0, Math.min(2, assistant.temperature))
            : 0.3;

        // features do agente têm prioridade; fallback para features do tenant
        const effectiveFeatures = assistant.features ?? {
            orderFlowEnabled: config.features?.orderFlowEnabled ?? true,
            financialEnabled: config.features?.financialEnabled ?? true,
        };
        const { definitions: effectiveTools, executionMap: toolExecutionMap } = getEffectiveTools(
            tid,
            assistantId ?? null,
            effectiveFeatures,
            assistant,
            config
        );
        const completionOptions: Record<string, unknown> = {
            model,
            messages,
            temperature,
            max_tokens: 1024,
        };
        if (effectiveTools.length > 0) {
            completionOptions.tools = effectiveTools;
            completionOptions.tool_choice = 'auto';
        }

        let completion = await openai.chat.completions.create(completionOptions as any);
        if (completion?.usage) {
            await usageStore.record(tid, {
                prompt_tokens: completion.usage.prompt_tokens ?? 0,
                completion_tokens: completion.usage.completion_tokens ?? 0,
                total_tokens: completion.usage.total_tokens ?? 0,
                model: completion.model ?? undefined,
            }, assistantId);
        }

        let choice = completion.choices[0];
        let message = choice.message;

        console.log(`[AI] finish_reason: ${choice.finish_reason}`);

        // Loop de Execução de Tools (max 5 iterações)
        let turns = 0;
        let pendingHandoff: { targetAgentId: string; transitionMessage: string } | null = null;
        let pendingHumanEscalation: { motivo: string } | null = null;

        while (message.tool_calls && message.tool_calls.length > 0 && turns < 5) {
            turns++;
            console.log(`[AI] Executando ${message.tool_calls.length} ferramenta(s) — turno ${turns}.`);
            messages.push(message);

            for (const toolCall of message.tool_calls) {
                const functionName = toolCall.function.name;
                const rawArgs = toolCall.function.arguments;
                // #region agent log
                fetch('http://127.0.0.1:7520/ingest/e566106f-4ab4-40ab-8bfd-c703d470cd11', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '00cc2d' }, body: JSON.stringify({ sessionId: '00cc2d', hypothesisId: 'H4', location: 'provider.ts:toolCall', message: 'Tool call before parse', data: { functionName, rawArgs: String(rawArgs).substring(0, 300) }, timestamp: Date.now() }) }).catch(() => { });
                // #endregion
                let functionArgs: any;
                try {
                    functionArgs = JSON.parse(rawArgs);
                } catch (parseErr: any) {
                    fetch('http://127.0.0.1:7520/ingest/e566106f-4ab4-40ab-8bfd-c703d470cd11', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '00cc2d' }, body: JSON.stringify({ sessionId: '00cc2d', hypothesisId: 'H4', location: 'provider.ts:parseArgs', message: 'JSON.parse args threw', data: { error: parseErr?.message }, timestamp: Date.now() }) }).catch(() => { });
                    throw parseErr;
                }
                console.log(`[AI] → ${functionName}(`, functionArgs, ')');

                let toolOutput = "Erro na execução da ferramenta.";
                const executor = toolExecutionMap[functionName];
                if (executor) {
                    try {
                        toolOutput = await executor(functionArgs);
                    } catch (err: any) {
                        console.error(`[AI] Erro ao rodar ${functionName}:`, err.message);
                        toolOutput = `Erro técnico: ${err.message}`;
                    }
                } else {
                    toolOutput = "Ferramenta não encontrada.";
                }

                // Detecta sinal de handoff da tool transferir_para_agente
                if (functionName === 'transferir_para_agente') {
                    try {
                        const parsed = JSON.parse(toolOutput);
                        if (parsed.__handoff__) {
                            pendingHandoff = {
                                targetAgentId: parsed.targetAgentId,
                                transitionMessage: parsed.transitionMessage,
                            };
                            console.log(`[AI] ← HANDOFF detectado → agente: ${parsed.targetAgentId}`);
                            toolOutput = JSON.stringify({
                                status: 'transfer_initiated',
                                message: `Transferência para o agente "${parsed.targetAgentId}" iniciada. Gere agora a mensagem de despedida e transição para o cliente.`,
                            });
                        }
                    } catch { /* não é JSON de handoff */ }
                }

                // Detecta sinal de escalação humana
                if (functionName === 'solicitar_atendente_humano') {
                    try {
                        const parsed = JSON.parse(toolOutput);
                        if (parsed.__human_escalation__) {
                            pendingHumanEscalation = { motivo: parsed.motivo || 'Solicitação do cliente' };
                            console.log(`[AI] ← HUMAN ESCALATION detectada — motivo: ${parsed.motivo}`);
                            toolOutput = JSON.stringify({
                                status: 'escalation_initiated',
                                message: 'Escalação para atendente humano registrada. Informe ao cliente que um atendente humano entrará em contato.',
                            });
                        }
                    } catch { /* não é JSON de escalação */ }
                }

                console.log(`[AI] ← ${functionName}:`, String(toolOutput).substring(0, 200));
                messages.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: toolOutput || "Sem retorno.",
                });
            }

            completion = await openai.chat.completions.create({
                ...completionOptions,
                messages,
            } as any);
            if (completion?.usage) {
                await usageStore.record(tid, {
                    prompt_tokens: completion.usage.prompt_tokens ?? 0,
                    completion_tokens: completion.usage.completion_tokens ?? 0,
                    total_tokens: completion.usage.total_tokens ?? 0,
                    model: completion.model ?? undefined,
                }, assistantId);
            }
            choice = completion.choices?.[0];
            message = choice?.message ?? null;

            // Se há handoff pendente, interrompe o loop após a resposta de transição
            if (pendingHandoff) break;
        }

        let finalContent = (message?.content && typeof message.content === 'string') ? message.content.trim() || null : null;
        // Nunca enviar ao usuário o prompt interno de handoff (evitar vazamento do JSON injetado para o modelo)
        if (pendingHandoff && finalContent && (finalContent.includes('transfer_initiated') || finalContent.includes('Gere agora a mensagem'))) {
            finalContent = null;
        }
        if (finalContent) finalContent = sanitizeResponseForPortuguese(finalContent);

        // Resposta truncada por limite de tokens
        if (choice?.finish_reason === 'length' && finalContent) {
            console.warn('[AI] Resposta truncada (finish_reason=length). Aplicando fallback.');
            finalContent = finalContent + '\n\n_(Resposta truncada. Se precisar de mais detalhes, reformule em partes.)_';
        } else if (choice?.finish_reason === 'length') {
            finalContent = null;
        }

        // Evitar enviar "..." ou respostas vazias/irrelevantes ao usuário
        const fallbackMessage = 'Desculpe, não consegui processar sua solicitação. Pode reformular?';
        if (!finalContent || /^\.{2,}\s*$/i.test(finalContent) || finalContent.length < 3) {
            if (!finalContent) {
                // Quando o modelo retorna conteúdo vazio após tool (ex.: consultar_estoque), monta resposta a partir do último resultado
                const toolMessages = messages.filter((m: any) => m.role === 'tool');
                const lastToolContent = toolMessages.length > 0 ? toolMessages[toolMessages.length - 1].content : null;
                if (typeof lastToolContent === 'string' && lastToolContent.trim().startsWith('[')) {
                    try {
                        const products = JSON.parse(lastToolContent);
                        if (Array.isArray(products) && products.length > 0) {
                            const p = products[0];
                            const nome = p.nome || 'Produto';
                            const sku = p.sku || '';
                            const preco = p.preco_promocional ?? p.preco_unitario ?? p.preco_tabela;
                            const disp = p.estoque_disponivel ?? 0;
                            finalContent = `Encontrei **${nome}**${sku ? ` (${sku})` : ''}.\n\n` +
                                `Preço: R$ ${Number(preco).toFixed(2)}${p.preco_promocional != null ? ' (promocional)' : ''}\n` +
                                `Estoque disponível: ${disp} unidades.\n\nDeseja fazer o pedido?`;
                        }
                    } catch (_) { /* não é JSON de produtos */ }
                }
                if (!finalContent && typeof lastToolContent === 'string' && lastToolContent.trim().length > 0) {
                    const trimmed = lastToolContent.trim();
                    if (!trimmed.includes('transfer_initiated') && !trimmed.includes('Gere agora a mensagem')) {
                        finalContent = trimmed;
                    }
                }
                if (!finalContent) {
                    // Em transferência: usar mensagem de transição em vez de fallback genérico
                    if (pendingHandoff?.transitionMessage?.trim()) {
                        finalContent = sanitizeResponseForPortuguese(pendingHandoff.transitionMessage.trim());
                    } else {
                        const errorDump = {
                            finish_reason: choice?.finish_reason,
                            message_object: message,
                            history_sent: messages.slice(-3)
                        };
                        try {
                            fs.writeFileSync('error_dump.json', JSON.stringify(errorDump, null, 2), 'utf8');
                            console.error('\n❌ [AI DEBUG] O modelo retornou string vazia ou inválida. Detalhes em error_dump.json');
                        } catch (e) {
                            console.error('\n❌ [AI DEBUG] Erro ao salvar dump:', e);
                        }
                        finalContent = fallbackMessage;
                    }
                }
            } else {
                // Em transferência: não mostrar "não consegui processar" — usar mensagem de transição
                finalContent = (pendingHandoff?.transitionMessage?.trim() ? sanitizeResponseForPortuguese(pendingHandoff.transitionMessage.trim()) : null) || fallbackMessage;
            }
        }

        // 🚨 CRÍTICO: Devemos adicionar a resposta final do LLM ao histórico para que
        // a próxima interação não tenha um "buraco", o que quebra o Gemini.
        messages.push({
            role: 'assistant',
            content: finalContent
        });

        return {
            content: finalContent,
            messages: messages,
            toolResults: messages.filter(m => m.role === 'tool'),
            handoff: pendingHandoff ?? null,
            humanEscalation: pendingHumanEscalation ?? null,
        };

    } catch (error: any) {
        const status = error?.response?.status;
        const data = error?.response?.data;
        const msg = error?.message || '';
        const code = error?.code;
        console.error('[AI] Erro ao chamar a IA:', { status, code, message: msg, data: data || error?.cause });
        let userMessage = "Desculpe, estou com instabilidade no momento. Tente novamente.";
        if (status === 401 || (typeof data === 'object' && data?.error?.code === 'invalid_api_key')) {
            userMessage = "Chave de API inválida ou expirada. Verifique OPENROUTER_API_KEY no servidor.";
        } else if (status === 429) {
            userMessage = "Muitas requisições no momento. Tente de novo em alguns segundos.";
        } else if (msg?.toLowerCase().includes('connection') || code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ENOTFOUND') {
            userMessage = "Não foi possível conectar ao serviço de IA. Tente novamente em alguns segundos.";
        }
        return {
            content: userMessage,
            messages: history,
            toolResults: [],
            handoff: null,
            humanEscalation: null,
        };
    }
};
