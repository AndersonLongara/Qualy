import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { getConfig, getAssistantConfig, type ResolvedAssistant, type ToolConfig } from '../../config/tenant';
import { usageStore } from '../../mock/usageStore';
import { toolsDefinition, toolsExecution, buildHandoffToolDefinition, getBuiltinToolsConfig, executeTool } from './tools';

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

type ToolDefinition = (typeof toolsDefinition)[number] | ReturnType<typeof buildHandoffToolDefinition>;

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
    for (const t of base) {
        const name = (t as any).function?.name as string;
        if (name) executionMap[name] = (args) => toolsExecution[name](tenantId, assistantId, args);
    }
    return { definitions: base, executionMap };
}

/** System prompt a partir de ResolvedAssistant (path ou texto); fallback para tenant prompt ou default. */
function getSystemPromptFromAssistant(assistant: ResolvedAssistant, tenantConfig: ReturnType<typeof getConfig>, cwd: string): string {
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
    const strictPrefix = `# IDENTIDADE E REGRAS OBRIGATÓRIAS
Você é ${assistantName}, assistente da ${companyName}. Siga estritamente as instruções e o tom definidos abaixo. Não invente informações que não estejam nas instruções.
- **Idioma:** Responda SEMPRE exclusivamente em português do Brasil. Não use palavras, caracteres, ideogramas ou símbolos de outros idiomas (nada de inglês, japonês, chinês, etc. no meio do texto).

---
`;
    let fullPrompt = strictPrefix + content;
    // Agentes com roteamento ativo: não pedir CPF/CNPJ para pedido — transferir para o agente correto
    if (assistant.handoffRules?.enabled && assistant.handoffRules.routes?.length) {
        fullPrompt += `

---
# ROTEAMENTO (OBRIGATÓRIO — FLUXO HUMANO)
Quando o cliente demonstrar intenção de **fazer pedido**, **comprar**, **ajuda com pedido** ou **operar financeiro** (boletos, 2ª via, etc.):
- **Reconheça só a intenção** e **ofereça a transferência**. NÃO faça perguntas sobre produtos, itens, como comprar ou qual produto o cliente quer — isso é papel do agente de destino (ex.: vendedor). Sua única ação é indicar que vai transferir e perguntar se pode transferir.
- **NÃO** peça CPF/CNPJ nem execute consultas de cliente. **NÃO** pergunte "qual produto?", "tem algo em mente?", "quer recomendação?" — essas perguntas são do setor de vendas, não suas.
- **Primeiro** mensagem curta: informe que vai encaminhar para o setor correto e **pergunte se pode transferir** (ex.: "Vou te transferir para nosso setor de vendas para te ajudar com o pedido. Pode ser?"). **NÃO chame a ferramenta de transferência nesta mensagem** — apenas aguarde a confirmação do cliente.
- **Só depois** que o cliente **confirmar** (sim, pode, ok, claro, pode ser, etc.) você **DEVE** chamar a ferramenta **transferir_para_agente**. O agente de destino é quem fará perguntas sobre produtos e pedido.`;
    }
    return fullPrompt;
}

export const getAIResponse = async (tenantId: string, userMessage: string, history: Array<any> = [], assistantId?: string | null) => {
    const tid = tenantId?.trim() || 'default';
    const config = getConfig(tid);
    const assistant = getAssistantConfig(tid, assistantId);
    const cwd = process.cwd();
    const systemPrompt = getSystemPromptFromAssistant(assistant, config, cwd);
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

        while (message.tool_calls && message.tool_calls.length > 0 && turns < 5) {
            turns++;
            console.log(`[AI] Executando ${message.tool_calls.length} ferramenta(s) — turno ${turns}.`);
            messages.push(message);

            for (const toolCall of message.tool_calls) {
                const functionName = toolCall.function.name;
                const rawArgs = toolCall.function.arguments;
                // #region agent log
                fetch('http://127.0.0.1:7520/ingest/e566106f-4ab4-40ab-8bfd-c703d470cd11',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'00cc2d'},body:JSON.stringify({sessionId:'00cc2d',hypothesisId:'H4',location:'provider.ts:toolCall',message:'Tool call before parse',data:{functionName,rawArgs:String(rawArgs).substring(0,300)},timestamp:Date.now()})}).catch(()=>{});
                // #endregion
                let functionArgs: any;
                try {
                    functionArgs = JSON.parse(rawArgs);
                } catch (parseErr: any) {
                    fetch('http://127.0.0.1:7520/ingest/e566106f-4ab4-40ab-8bfd-c703d470cd11',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'00cc2d'},body:JSON.stringify({sessionId:'00cc2d',hypothesisId:'H4',location:'provider.ts:parseArgs',message:'JSON.parse args threw',data:{error:parseErr?.message},timestamp:Date.now()})}).catch(()=>{});
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
                            // Injeta resposta positiva para que o LLM gere a mensagem de transição
                            toolOutput = JSON.stringify({
                                status: 'transfer_initiated',
                                message: `Transferência para o agente "${parsed.targetAgentId}" iniciada. Gere agora a mensagem de despedida e transição para o cliente.`,
                            });
                        }
                    } catch { /* não é JSON de handoff */ }
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
                    finalContent = lastToolContent.trim();
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
        };
    }
};
