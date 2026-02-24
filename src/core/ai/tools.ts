import axios from 'axios';
import { getConfig, getAssistantConfig, type AssistantApiConfig, type HandoffRoute, type ToolConfig } from '../../config/tenant';

/** Rotas padrão para o modo production (e fallback do tenant). */
const DEFAULT_ROUTES = {
    clientes: '/v1/clientes',
    titulos: '/v1/financeiro/titulos',
    pedidos: '/v1/faturamento/pedidos',
    estoque: '/v1/vendas/estoque',
    pedido_post: '/v1/vendas/pedido',
};

function resolveRoute(api: AssistantApiConfig | null, key: keyof typeof DEFAULT_ROUTES): string {
    if (api?.routes?.[key]) return api.routes[key]!;
    return DEFAULT_ROUTES[key];
}

/**
 * Resolve a base URL para chamadas de API do agente.
 * Prioridade: assistant.api.baseUrl → tenant.api.baseUrl → localhost fallback.
 */
function getApiBaseUrl(tenantId?: string, assistantId?: string | null): string {
    const assistant = getAssistantConfig(tenantId ?? 'default', assistantId);
    if (assistant.api?.mode === 'production' && assistant.api.baseUrl) {
        return assistant.api.baseUrl.replace(/\/$/, '');
    }
    const config = getConfig(tenantId);
    const base = config.api.baseUrl || 'http://localhost:3001';
    return base.replace(/\/$/, '');
}

/**
 * Se o agente tiver mode=mock, retorna os dados mock correspondentes.
 * Retorna null quando o agente está em modo production (deve chamar API real).
 */
function getMockData(
    tenantId: string,
    assistantId: string | null | undefined,
    section: 'clientes' | 'titulos' | 'pedidos' | 'estoque'
): unknown | null {
    const assistant = getAssistantConfig(tenantId, assistantId);
    if (assistant.api?.mode !== 'mock') return null;
    return assistant.api.mockData?.[section] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Definitions (JSON Schema para OpenAI / OpenRouter)
// ─────────────────────────────────────────────────────────────────────────────
export const toolsDefinition = [
    {
        type: 'function',
        function: {
            name: 'consultar_cliente',
            description: 'Verifica se um cliente existe e retorna seus dados cadastrais, status e filiais. Use ANTES de qualquer operação financeira ou de pedido.',
            parameters: {
                type: 'object',
                properties: {
                    documento: {
                        type: 'string',
                        description: 'CPF ou CNPJ do cliente (pode ser formatado ou apenas números).',
                    },
                },
                required: ['documento'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'consultar_titulos',
            description: 'Lista os títulos financeiros (boletos) de um cliente. Use quando o cliente perguntar sobre boletos, 2ª via, débitos ou situação financeira.',
            parameters: {
                type: 'object',
                properties: {
                    documento: {
                        type: 'string',
                        description: 'CPF ou CNPJ do cliente.',
                    },
                    status: {
                        type: 'string',
                        enum: ['vencido', 'a_vencer'],
                        description: 'Filtrar por status. Omitir para retornar todos.',
                    },
                },
                required: ['documento'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'consultar_pedidos',
            description: 'Consulta o histórico de pedidos de um cliente, incluindo status de rastreio e links de NF-e/DANFE. Use quando o cliente perguntar sobre entregas, notas fiscais ou pedidos.',
            parameters: {
                type: 'object',
                properties: {
                    documento: {
                        type: 'string',
                        description: 'CPF ou CNPJ do cliente.',
                    },
                    status: {
                        type: 'string',
                        enum: ['faturado', 'em_transito', 'aguardando_faturamento'],
                        description: 'Filtrar por status do pedido. Omitir para retornar todos.',
                    },
                },
                required: ['documento'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'consultar_estoque',
            description: 'Consulta preço e disponibilidade de produtos em estoque. Use quando o cliente perguntar sobre produtos, preços, disponibilidade ou quiser fazer um pedido.',
            parameters: {
                type: 'object',
                properties: {
                    busca: {
                        type: 'string',
                        description: 'Nome do produto ou código SKU para busca.',
                    },
                },
                required: ['busca'],
            },
        },
    },
];

/** Lista de tools built-in (para listagem no admin e seeds). */
export const BUILTIN_TOOL_KEYS = ['consultar_cliente', 'consultar_titulos', 'consultar_pedidos', 'consultar_estoque'] as const;

/**
 * Gera a definição da tool de escalação para atendente humano.
 * Incluída quando chatFlow.humanEscalation.enabled = true.
 */
export function buildHumanEscalationToolDefinition() {
    return {
        type: 'function',
        function: {
            name: 'solicitar_atendente_humano',
            description: 'Solicita a transferência do atendimento para um atendente humano. Use quando o cliente pedir explicitamente para falar com uma pessoa, ou quando você não conseguir resolver o problema do cliente. Preencha o motivo da escalação.',
            parameters: {
                type: 'object',
                properties: {
                    motivo: {
                        type: 'string',
                        description: 'Breve motivo da escalação (ex.: "cliente solicitou atendente humano", "dúvida não coberta pelo assistente").',
                    },
                },
                required: ['motivo'],
            },
        },
    };
}

/** Retorna definições ToolConfig das tools built-in (para merge na listagem do tenant). */
export function getBuiltinToolsConfig(): ToolConfig[] {
    return toolsDefinition
        .filter((t) => BUILTIN_TOOL_KEYS.includes((t as any).function?.name as any))
        .map((t) => {
            const f = (t as any).function;
            return {
                id: f.name,
                name: f.name,
                description: f.description || '',
                parameters: f.parameters || { type: 'object' as const, properties: {}, required: [] },
                execution: { type: 'builtin' as const, key: f.name },
            };
        });
}

/**
 * Gera a definição da tool de transferência de agente com enum dinâmico baseado nas rotas configuradas.
 * Deve ser incluída nos effectiveTools apenas quando handoffRules.enabled = true.
 */
export function buildHandoffToolDefinition(routes: HandoffRoute[]) {
    const agentIds = routes.map((r) => r.agentId);
    const descriptions = routes.map((r) => `"${r.agentId}" = ${r.label}: ${r.description}`).join('; ');
    return {
        type: 'function',
        function: {
            name: 'transferir_para_agente',
            description: `Transfere o atendimento para outro agente. Antes de transferir: NÃO pergunte sobre produtos — apenas ofereça a transferência e pergunte "Pode ser?". Chame esta ferramenta SOMENTE após o cliente confirmar. Quando o cliente responder "sim", "pode", "ok" ou "claro" à sua pergunta "Pode ser?", chame IMEDIATAMENTE esta ferramenta (não responda só com texto). NUNCA chame na mesma mensagem em que pergunta "Pode ser?" — aguarde a confirmação. Agentes: ${descriptions}. Preencha agente e mensagem_transicao.`,
            parameters: {
                type: 'object',
                properties: {
                    agente: {
                        type: 'string',
                        enum: agentIds,
                        description: 'ID do agente de destino para onde transferir o cliente.',
                    },
                    mensagem_transicao: {
                        type: 'string',
                        description: 'Mensagem de encerramento e apresentação da transferência (ex: "Vou te encaminhar para nosso setor de vendas que poderá te ajudar melhor com isso!").',
                    },
                },
                required: ['agente', 'mensagem_transicao'],
            },
        },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Execution Logic
// ─────────────────────────────────────────────────────────────────────────────
/** (tenantId, assistantId, args) em produção; (args) em testes legados */
export const toolsExecution: Record<string, (a: string | Record<string, unknown>, b?: string | Record<string, unknown> | null, c?: Record<string, unknown>) => Promise<string>> = {

    consultar_cliente: async (tenantIdOrArgs: string | Record<string, unknown>, assistantIdOrArgs?: string | Record<string, unknown> | null, args?: Record<string, unknown>) => {
        const [tid, aid, a] = typeof tenantIdOrArgs === 'string'
            ? [tenantIdOrArgs, typeof assistantIdOrArgs === 'string' ? assistantIdOrArgs : null, typeof assistantIdOrArgs === 'object' && assistantIdOrArgs !== null ? assistantIdOrArgs as Record<string, unknown> : (args ?? {})]
            : ['default', null, tenantIdOrArgs];
        const documento = a && typeof a === 'object' && 'documento' in a ? String(a.documento) : undefined;
        const digitsOnly = documento?.replace(/\D/g, '') ?? '';

        const mock = getMockData(tid, aid, 'clientes');
        if (mock !== null) {
            const clientes = mock as Record<string, unknown>;
            const client = clientes[digitsOnly];
            if (client) return JSON.stringify(client);
            return 'Cliente não encontrado na base de dados.';
        }

        try {
            const base = getApiBaseUrl(tid, aid);
            const route = resolveRoute(getAssistantConfig(tid, aid).api, 'clientes');
            const response = await axios.get(`${base}${route}`, { params: { doc: documento } });
            return JSON.stringify(response.data);
        } catch (error: any) {
            if (error.response?.status === 404) return 'Cliente não encontrado na base de dados.';
            return 'Erro ao consultar dados do cliente. Tente novamente.';
        }
    },

    consultar_titulos: async (tenantIdOrArgs: string | Record<string, unknown>, assistantIdOrArgs?: string | Record<string, unknown> | null, args?: Record<string, unknown>) => {
        const [tid, aid, a] = typeof tenantIdOrArgs === 'string'
            ? [tenantIdOrArgs, typeof assistantIdOrArgs === 'string' ? assistantIdOrArgs : null, typeof assistantIdOrArgs === 'object' && assistantIdOrArgs !== null ? assistantIdOrArgs as Record<string, unknown> : (args ?? {})]
            : ['default', null, tenantIdOrArgs];
        const documento = a && typeof a === 'object' && 'documento' in a ? String(a.documento) : undefined;
        const digitsOnly = documento?.replace(/\D/g, '') ?? '';
        const status = a && typeof a === 'object' && 'status' in a ? String(a.status) : undefined;

        const mock = getMockData(tid, aid, 'titulos');
        if (mock !== null) {
            const titulos = mock as Record<string, unknown[]>;
            let list: unknown[] = titulos[digitsOnly] ?? [];
            if (status) list = list.filter((t: any) => t.status === status);
            if (!list.length) return 'Nenhum título encontrado com os critérios informados.';
            return JSON.stringify(list.map((t: any) => ({
                nota: t.numero_nota,
                valor: `R$ ${(t.valor_atualizado ?? 0).toFixed(2)}`,
                vencimento: t.vencimento,
                status: t.status === 'vencido' ? 'VENCIDO' : 'A VENCER',
                link_boleto: t.pdf_url,
                linha_digitavel: t.linha_digitavel,
            })));
        }

        try {
            const params: any = { doc: documento };
            if (status) params.status = status;
            const base = getApiBaseUrl(tid, aid);
            const route = resolveRoute(getAssistantConfig(tid, aid).api, 'titulos');
            const response = await axios.get(`${base}${route}`, { params });
            const titulos = response.data;
            if (!titulos || titulos.length === 0) return 'Nenhum título encontrado com os critérios informados.';
            return JSON.stringify(titulos.map((t: any) => ({
                nota: t.numero_nota,
                valor: `R$ ${t.valor_atualizado.toFixed(2)}`,
                vencimento: t.vencimento,
                status: t.status === 'vencido' ? 'VENCIDO' : 'A VENCER',
                link_boleto: t.pdf_url,
                linha_digitavel: t.linha_digitavel,
            })));
        } catch {
            return 'Erro ao consultar títulos financeiros.';
        }
    },

    consultar_pedidos: async (tenantIdOrArgs: string | Record<string, unknown>, assistantIdOrArgs?: string | Record<string, unknown> | null, args?: Record<string, unknown>) => {
        const [tid, aid, a] = typeof tenantIdOrArgs === 'string'
            ? [tenantIdOrArgs, typeof assistantIdOrArgs === 'string' ? assistantIdOrArgs : null, typeof assistantIdOrArgs === 'object' && assistantIdOrArgs !== null ? assistantIdOrArgs as Record<string, unknown> : (args ?? {})]
            : ['default', null, tenantIdOrArgs];
        const documento = a && typeof a === 'object' && 'documento' in a ? String(a.documento) : undefined;
        const digitsOnly = documento?.replace(/\D/g, '') ?? '';
        const status = a && typeof a === 'object' && 'status' in a ? String(a.status) : undefined;

        const mock = getMockData(tid, aid, 'pedidos');
        if (mock !== null) {
            const pedidos = mock as Record<string, unknown[]>;
            let list: unknown[] = pedidos[digitsOnly] ?? [];
            if (status) list = list.filter((p: any) => p.status === status);
            if (!list.length) return 'Nenhum pedido encontrado para este cliente nos últimos 60 dias.';
            return JSON.stringify(list.map((p: any) => ({
                pedido: p.id,
                data: p.data,
                valor_total: `R$ ${(p.valor_total ?? 0).toFixed(2)}`,
                status: p.status,
                nfe_numero: p.nfe?.numero || null,
                danfe_url: p.nfe?.danfe_url || null,
                rastreio: p.rastreio ? `${p.rastreio.transportadora} — ${p.rastreio.codigo} (${p.rastreio.status})` : null,
            })));
        }

        try {
            const params: any = { doc: documento };
            if (status) params.status = status;
            const base = getApiBaseUrl(tid, aid);
            const route = resolveRoute(getAssistantConfig(tid, aid).api, 'pedidos');
            const response = await axios.get(`${base}${route}`, { params });
            const pedidos = response.data;
            if (!pedidos || pedidos.length === 0) return 'Nenhum pedido encontrado para este cliente nos últimos 60 dias.';
            return JSON.stringify(pedidos.map((p: any) => ({
                pedido: p.id,
                data: p.data,
                valor_total: `R$ ${p.valor_total.toFixed(2)}`,
                status: p.status,
                nfe_numero: p.nfe?.numero || null,
                danfe_url: p.nfe?.danfe_url || null,
                rastreio: p.rastreio ? `${p.rastreio.transportadora} — ${p.rastreio.codigo} (${p.rastreio.status})` : null,
            })));
        } catch {
            return 'Erro ao consultar pedidos.';
        }
    },

    /**
     * transferir_para_agente: a execução retorna um JSON especial que o provider.ts interpreta
     * como sinal de handoff — não é uma resposta de dados mas uma instrução de roteamento.
     */
    transferir_para_agente: async (_tenantIdOrArgs: string | Record<string, unknown>, _assistantIdOrArgs?: string | Record<string, unknown> | null, args?: Record<string, unknown>) => {
        const a = typeof _tenantIdOrArgs === 'object' ? _tenantIdOrArgs : (args ?? {});
        const agente = typeof a.agente === 'string' ? a.agente : '';
        const mensagem = typeof a.mensagem_transicao === 'string' ? a.mensagem_transicao : 'Transferindo para o próximo agente.';
        // Retorna JSON especial que o provider reconhece como handoff trigger
        return JSON.stringify({ __handoff__: true, targetAgentId: agente, transitionMessage: mensagem });
    },

    solicitar_atendente_humano: async (_tenantIdOrArgs: string | Record<string, unknown>, _assistantIdOrArgs?: string | Record<string, unknown> | null, args?: Record<string, unknown>) => {
        const a = typeof _tenantIdOrArgs === 'object' ? _tenantIdOrArgs : (args ?? {});
        const motivo = typeof a.motivo === 'string' ? a.motivo : 'Solicitação do cliente';
        return JSON.stringify({ __human_escalation__: true, motivo });
    },

    consultar_estoque: async (tenantIdOrArgs: string | Record<string, unknown>, assistantIdOrArgs?: string | Record<string, unknown> | null, args?: Record<string, unknown>) => {
        const [tid, aid, a] = typeof tenantIdOrArgs === 'string'
            ? [tenantIdOrArgs, typeof assistantIdOrArgs === 'string' ? assistantIdOrArgs : null, typeof assistantIdOrArgs === 'object' && assistantIdOrArgs !== null ? assistantIdOrArgs as Record<string, unknown> : (args ?? {})]
            : ['default', null, tenantIdOrArgs];
        const busca = a && typeof a === 'object' && 'busca' in a ? String(a.busca) : '';

        const mock = getMockData(tid, aid, 'estoque');
        // #region agent log
        fetch('http://127.0.0.1:7520/ingest/e566106f-4ab4-40ab-8bfd-c703d470cd11',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'00cc2d'},body:JSON.stringify({sessionId:'00cc2d',hypothesisId:'H1-H2-H3',location:'tools.ts:consultar_estoque:entry',message:'consultar_estoque entry',data:{tid,aid,busca,mockNotNull:mock!==null,isArray:Array.isArray(mock),mockLength:Array.isArray(mock)?(mock as any[]).length:undefined,firstItemSkuType:Array.isArray(mock)&&(mock as any[])[0]?typeof (mock as any[])[0].sku:'n/a',firstItemNomeType:Array.isArray(mock)&&(mock as any[])[0]?typeof (mock as any[])[0].nome:'n/a'},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        if (mock !== null) {
            const estoque = mock as any[];
            const buscaLower = busca.toLowerCase();
            let result = estoque;
            if (buscaLower) {
                try {
                    result = result.filter((p) => p.nome?.toLowerCase().includes(buscaLower) || p.sku?.toLowerCase().includes(buscaLower));
                } catch (filterErr: any) {
                    // #region agent log
                    fetch('http://127.0.0.1:7520/ingest/e566106f-4ab4-40ab-8bfd-c703d470cd11',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'00cc2d'},body:JSON.stringify({sessionId:'00cc2d',hypothesisId:'H3',location:'tools.ts:consultar_estoque:filter',message:'filter threw',data:{error:filterErr?.message,stack:String(filterErr?.stack||'').substring(0,300)},timestamp:Date.now()})}).catch(()=>{});
                    // #endregion
                    throw filterErr;
                }
            }
            if (!result.length) return 'Nenhum produto encontrado com esse termo de busca.';
            return JSON.stringify(result.map((p: any) => ({
                nome: p.nome,
                sku: p.sku,
                estoque_disponivel: p.estoque_disponivel,
                estoque_status: p.estoque_disponivel > 0 ? 'Disponível' : 'Sem estoque',
                preco_unitario: p.preco_tabela,
                preco_promocional: p.preco_promocional ?? null,
            })));
        }

        try {
            // #region agent log
            fetch('http://127.0.0.1:7520/ingest/e566106f-4ab4-40ab-8bfd-c703d470cd11',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'00cc2d'},body:JSON.stringify({sessionId:'00cc2d',hypothesisId:'H1',location:'tools.ts:consultar_estoque:httpPath',message:'Using HTTP (mock was null)',data:{tid,aid,busca},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            const base = getApiBaseUrl(tid, aid);
            const route = resolveRoute(getAssistantConfig(tid, aid).api, 'estoque');
            const response = await axios.get(`${base}${route}`, { params: { busca } });
            const produtos = response.data;
            if (!produtos || produtos.length === 0) return 'Nenhum produto encontrado com esse termo de busca.';
            const formatted = produtos.map((p: any) => ({
                nome: p.nome,
                sku: p.sku,
                estoque_disponivel: p.estoque_disponivel,
                estoque_status: p.estoque_disponivel > 0 ? 'Disponível' : 'Sem estoque',
                preco_unitario: p.preco_tabela,
                preco_promocional: p.preco_promocional ?? null,
            }));
            console.log(`[TOOL] consultar_estoque resultado:`, JSON.stringify(formatted));
            return JSON.stringify(formatted);
        } catch (error: any) {
            console.error(`[TOOL] Erro em consultar_estoque:`, error.message);
            return 'Erro ao consultar estoque.';
        }
    },
};

/** Timeout e tamanho máximo para tools HTTP (segurança). */
const HTTP_TOOL_TIMEOUT_MS = 15000;
const HTTP_TOOL_MAX_BODY_LENGTH = 100 * 1024; // 100 KB

/**
 * Executa uma tool (built-in ou HTTP) com o contexto do tenant/agente.
 * Usado pelo provider e pelo endpoint de teste do admin.
 */
export async function executeTool(
    tenantId: string,
    assistantId: string | null,
    toolConfig: ToolConfig,
    args: Record<string, unknown>
): Promise<string> {
    const { execution } = toolConfig;
    if (execution.type === 'builtin') {
        const fn = toolsExecution[execution.key];
        if (!fn) return `Ferramenta built-in "${execution.key}" não encontrada.`;
        return fn(tenantId, assistantId, args);
    }
    // execution.type === 'http'
    const { url, method } = execution;
    try {
        const config: { url: string; method: 'GET' | 'POST'; params?: Record<string, unknown>; data?: Record<string, unknown>; timeout: number; maxContentLength: number } = {
            url,
            method,
            timeout: HTTP_TOOL_TIMEOUT_MS,
            maxContentLength: HTTP_TOOL_MAX_BODY_LENGTH,
        };
        if (method === 'GET') {
            config.params = args;
        } else {
            config.data = args;
        }
        const response = await axios(config);
        const data = response.data;
        if (typeof data === 'string') return data;
        return JSON.stringify(data);
    } catch (error: any) {
        const msg = error.response?.data && typeof error.response.data === 'object'
            ? JSON.stringify(error.response.data)
            : error.message || 'Erro na chamada HTTP.';
        return `Erro ao executar ferramenta: ${msg}`;
    }
}
