/**
 * Configuração por cliente (tenant).
 *
 * Env vars aceitas (sobrescrevem arquivo):
 *   API_BASE_URL, ASSISTANT_NAME, COMPANY_NAME, SYSTEM_PROMPT_PATH
 *   OPENROUTER_API_KEY, OPENROUTER_MODEL, PORT
 */
import path from 'path';
import fs from 'fs';

/** Configuração de integração de dados por agente. */
export interface AssistantApiConfig {
    /** 'production' = chama API real; 'mock' = usa mockData em memória. */
    mode: 'production' | 'mock';
    /** URL base da API do ERP/sistema do cliente. Só usada no modo production. */
    baseUrl?: string | null;
    /** Rotas customizáveis. Se omitidas, usam os padrões /v1/... */
    routes?: {
        clientes?: string;      // padrão: /v1/clientes
        titulos?: string;       // padrão: /v1/financeiro/titulos
        pedidos?: string;       // padrão: /v1/faturamento/pedidos
        estoque?: string;       // padrão: /v1/vendas/estoque
        pedido_post?: string;   // padrão: /v1/vendas/pedido
    } | null;
    /** Dados mock por seção. Só usados no modo mock. */
    mockData?: {
        clientes?: Record<string, unknown>;
        titulos?: Record<string, unknown[]>;
        pedidos?: Record<string, unknown[]>;
        estoque?: unknown[];
    } | null;
}

/** Uma rota de transferência para outro agente. */
export interface HandoffRoute {
    /** ID do agente de destino (deve existir no mesmo tenant). */
    agentId: string;
    /** Rótulo legível para o LLM (ex: "Vendedor"). */
    label: string;
    /** Instrução para o LLM: quando transferir para este agente. */
    description: string;
}

/** Regras de transferência entre agentes (cadeia de agentes). */
export interface HandoffRules {
    enabled: boolean;
    routes: HandoffRoute[];
}

/** Execução de uma tool: built-in (código) ou HTTP. */
export type ToolExecution =
    | { type: 'builtin'; key: string }
    | { type: 'http'; url: string; method: 'GET' | 'POST' };

/** Configuração de uma tool por tenant (built-in ou custom). */
export interface ToolConfig {
    id: string;
    name: string;
    description: string;
    parameters: { type: 'object'; properties?: Record<string, unknown>; required?: string[] };
    execution: ToolExecution;
}

/** Mensagens do fluxo de pedido (configuráveis no painel). Use {{productName}}, {{qty}}, {{total}}, {{customerName}}, {{available}}, {{pedido_id}}, {{mensagem}} nos templates. */
export interface OrderFlowMessages {
    /** Quando não há produto selecionado. */
    askProduct?: string | null;
    /** Pedido sem quantidade ainda. Template: {{productName}}. */
    askDocument?: string | null;
    /** Pedido com quantidade. Templates: {{qty}}, {{productName}}, {{total}}. */
    askDocumentWithQuantity?: string | null;
    /** Documento inválido. */
    invalidDocument?: string | null;
    /** Cliente não encontrado. */
    customerNotFound?: string | null;
    /** Cliente bloqueado. Template: {{name}}. */
    customerBlocked?: string | null;
    /** Pedir quantidade. Templates: {{productName}}, {{preco}}, {{available}}. */
    askQuantity?: string | null;
    /** Só N unidades disponíveis. Templates: {{available}}, {{productName}}. */
    onlyNUnitsAvailable?: string | null;
    /** Resumo para confirmação. Templates: {{productName}}, {{quantity}}, {{total}}, {{customerName}}. */
    confirmOrder?: string | null;
    /** Pedido registrado. Templates: {{quantity}}, {{productName}}, {{pedido_id}}, {{mensagem}}. */
    orderSuccess?: string | null;
    /** Erro ao criar pedido (fallback). Templates: {{quantity}}, {{productName}}. */
    orderErrorFallback?: string | null;
    /** Pedido cancelado. */
    orderCancelled?: string | null;
    /** Peça confirmação sim/não. */
    confirmYesNo?: string | null;
}

/** Configuração de um agente de IA dentro de um tenant (plano: múltiplos agentes por empresa). */
export interface AssistantConfig {
    id: string;
    name: string;
    systemPromptPath?: string | null;
    systemPrompt?: string | null;
    model?: string | null;
    /** Temperatura do modelo (0–2). Se não definido, usa prompt.temperature do tenant. */
    temperature?: number | null;
    /** Integração de dados do agente: produção (API real) ou mock. Se null, herda do tenant. */
    api?: AssistantApiConfig | null;
    /** Features do agente. Se null, herda do tenant. */
    features?: {
        orderFlowEnabled?: boolean;
        financialEnabled?: boolean;
    } | null;
    /** Regras de transferência para outros agentes. Se null, sem cadeia. */
    handoffRules?: HandoffRules | null;
    /** IDs das tools que o agente pode usar. Se definido, só essas tools; se ausente, usa lógica por features. */
    toolIds?: string[] | null;
}

/** Configuração de escalação para atendente humano. */
export interface HumanEscalationConfig {
    enabled: boolean;
    /** Mensagem exibida ao usuário quando a escalação ocorre. */
    message?: string | null;
    /** URL do webhook chamado quando o usuário pede humano (ex.: abrir ticket, notificar CRM). */
    webhookUrl?: string | null;
    /** Método HTTP do webhook. Padrão: POST. */
    method?: 'GET' | 'POST';
}

/** Fluxo do chat: agente inicial e regras de escalação humana. */
export interface ChatFlowConfig {
    /** ID do agente que inicia a conversa (deve existir na lista assistants). */
    entryAgentId: string;
    /** Regras de escalação para atendente humano. */
    humanEscalation?: HumanEscalationConfig | null;
}

export interface TenantConfig {
    branding: {
        companyName: string;
        assistantName: string;
        productName?: string;
    };
    api: {
        baseUrl: string;
    };
    prompt: {
        systemPromptPath?: string | null;
        systemPrompt?: string | null;
        /** Template da saudação inicial. Use {{assistantName}} e {{companyName}}. */
        greeting?: string | null;
        /** Mensagem exibida quando o usuário pede atendente humano. */
        humanAgentMessage?: string | null;
        /** Temperatura do modelo (0–2). O agente deve seguir o prompt restritamente com valores mais baixos. */
        temperature?: number | null;
        /** Mensagens do fluxo de pedido (opcional). Se ausente, usam-se os textos padrão do código. */
        orderFlowMessages?: OrderFlowMessages | null;
    };
    features: {
        orderFlowEnabled: boolean;
        financialEnabled: boolean;
    };
    /** Lista de agentes por tenant. Se ausente ou vazio, usa um agente default (branding.assistantName + prompt do tenant). */
    assistants?: AssistantConfig[];
    /** Lista de tools do tenant (built-in referenciadas ou custom). */
    tools?: ToolConfig[];
    /** Fluxo do chat: agente de entrada e escalação humana. Se ausente, usa o primeiro assistente ou default. */
    chatFlow?: ChatFlowConfig | null;
}

const DEFAULTS: TenantConfig = {
    branding: {
        companyName: 'AltraFlow',
        assistantName: 'AltraFlow',
        productName: undefined,
    },
    api: {
        baseUrl: 'http://localhost:3001',
    },
    prompt: {
        systemPromptPath: null,
        systemPrompt: null,
        greeting: null,
        humanAgentMessage: null,
        temperature: 0.3,
        orderFlowMessages: null,
    },
    features: {
        orderFlowEnabled: true,
        financialEnabled: true,
    },
};

function ensureNonEmptyString(value: unknown, fallback: string): string {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    return fallback;
}

function optString(v: unknown): string | null {
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
    return null;
}

function normalizeOrderFlowMessages(raw: unknown): OrderFlowMessages | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const m: OrderFlowMessages = {};
    if (optString(o.askProduct) != null) m.askProduct = optString(o.askProduct);
    if (optString(o.askDocument) != null) m.askDocument = optString(o.askDocument);
    if (optString(o.askDocumentWithQuantity) != null) m.askDocumentWithQuantity = optString(o.askDocumentWithQuantity);
    if (optString(o.invalidDocument) != null) m.invalidDocument = optString(o.invalidDocument);
    if (optString(o.customerNotFound) != null) m.customerNotFound = optString(o.customerNotFound);
    if (optString(o.customerBlocked) != null) m.customerBlocked = optString(o.customerBlocked);
    if (optString(o.askQuantity) != null) m.askQuantity = optString(o.askQuantity);
    if (optString(o.onlyNUnitsAvailable) != null) m.onlyNUnitsAvailable = optString(o.onlyNUnitsAvailable);
    if (optString(o.confirmOrder) != null) m.confirmOrder = optString(o.confirmOrder);
    if (optString(o.orderSuccess) != null) m.orderSuccess = optString(o.orderSuccess);
    if (optString(o.orderErrorFallback) != null) m.orderErrorFallback = optString(o.orderErrorFallback);
    if (optString(o.orderCancelled) != null) m.orderCancelled = optString(o.orderCancelled);
    if (optString(o.confirmYesNo) != null) m.confirmYesNo = optString(o.confirmYesNo);
    return Object.keys(m).length > 0 ? m : null;
}

function clampTemperature(v: unknown): number | null {
    if (typeof v !== 'number' || Number.isNaN(v)) return null;
    const n = Math.max(0, Math.min(2, v));
    return n;
}

function normalizeAssistantApi(raw: unknown): AssistantApiConfig | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const mode = o.mode === 'production' || o.mode === 'mock' ? o.mode : null;
    if (!mode) return null;

    const routesRaw = o.routes && typeof o.routes === 'object' && !Array.isArray(o.routes)
        ? (o.routes as Record<string, unknown>)
        : null;
    const routes = routesRaw ? {
        clientes: typeof routesRaw.clientes === 'string' ? routesRaw.clientes.trim() || undefined : undefined,
        titulos: typeof routesRaw.titulos === 'string' ? routesRaw.titulos.trim() || undefined : undefined,
        pedidos: typeof routesRaw.pedidos === 'string' ? routesRaw.pedidos.trim() || undefined : undefined,
        estoque: typeof routesRaw.estoque === 'string' ? routesRaw.estoque.trim() || undefined : undefined,
        pedido_post: typeof routesRaw.pedido_post === 'string' ? routesRaw.pedido_post.trim() || undefined : undefined,
    } : null;

    const mockDataRaw = o.mockData && typeof o.mockData === 'object' && !Array.isArray(o.mockData)
        ? (o.mockData as Record<string, unknown>)
        : null;
    const mockData = mockDataRaw ? {
        clientes: mockDataRaw.clientes && typeof mockDataRaw.clientes === 'object' && !Array.isArray(mockDataRaw.clientes)
            ? (mockDataRaw.clientes as Record<string, unknown>)
            : undefined,
        titulos: Array.isArray(mockDataRaw.titulos)
            ? undefined
            : mockDataRaw.titulos && typeof mockDataRaw.titulos === 'object'
                ? (mockDataRaw.titulos as Record<string, unknown[]>)
                : undefined,
        pedidos: Array.isArray(mockDataRaw.pedidos)
            ? undefined
            : mockDataRaw.pedidos && typeof mockDataRaw.pedidos === 'object'
                ? (mockDataRaw.pedidos as Record<string, unknown[]>)
                : undefined,
        estoque: Array.isArray(mockDataRaw.estoque) ? (mockDataRaw.estoque as unknown[]) : undefined,
    } : null;

    return {
        mode,
        baseUrl: typeof o.baseUrl === 'string' ? o.baseUrl.trim() || null : null,
        routes: routes ?? null,
        mockData: mockData ?? null,
    };
}

function normalizeToolExecution(raw: unknown): ToolExecution | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const type = o.type === 'builtin' || o.type === 'http' ? o.type : null;
    if (!type) return null;
    if (type === 'builtin') {
        const key = typeof o.key === 'string' ? o.key.trim() : '';
        return key ? { type: 'builtin', key } : null;
    }
    const url = typeof o.url === 'string' ? o.url.trim() : '';
    const method = o.method === 'GET' || o.method === 'POST' ? o.method : 'GET';
    return url ? { type: 'http', url, method } : null;
}

function normalizeTool(raw: unknown): ToolConfig | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id.trim() : '';
    const name = typeof o.name === 'string' ? o.name.trim() : id;
    const description = typeof o.description === 'string' ? o.description.trim() : '';
    const execution = normalizeToolExecution(o.execution);
    if (!id || !execution) return null;
    const paramsRaw = o.parameters;
    const parameters =
        paramsRaw && typeof paramsRaw === 'object' && !Array.isArray(paramsRaw) && (paramsRaw as Record<string, unknown>).type === 'object'
            ? (paramsRaw as { type: 'object'; properties?: Record<string, unknown>; required?: string[] })
            : { type: 'object' as const, properties: {}, required: [] };
    return {
        id,
        name: name || id,
        description,
        parameters,
        execution,
    };
}

function normalizeHumanEscalation(raw: unknown): HumanEscalationConfig | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const enabled = typeof o.enabled === 'boolean' ? o.enabled : false;
    const message = typeof o.message === 'string' ? o.message.trim() || null : null;
    const webhookUrl = typeof o.webhookUrl === 'string' ? o.webhookUrl.trim() || null : null;
    const method = o.method === 'GET' || o.method === 'POST' ? o.method : 'POST';
    return { enabled, message, webhookUrl, method };
}

function normalizeChatFlow(raw: unknown): ChatFlowConfig | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const entryAgentId = typeof o.entryAgentId === 'string' ? o.entryAgentId.trim() : '';
    if (!entryAgentId) return null;
    return {
        entryAgentId,
        humanEscalation: normalizeHumanEscalation(o.humanEscalation),
    };
}

function normalizeHandoffRules(raw: unknown): HandoffRules | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const enabled = typeof o.enabled === 'boolean' ? o.enabled : false;
    const routesRaw = Array.isArray(o.routes) ? o.routes : [];
    const routes: HandoffRoute[] = routesRaw
        .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
        .map((r) => ({
            agentId: typeof r.agentId === 'string' ? r.agentId.trim() : '',
            label: typeof r.label === 'string' ? r.label.trim() : '',
            description: typeof r.description === 'string' ? r.description.trim() : '',
        }))
        .filter((r) => r.agentId && r.label);
    return { enabled, routes };
}

function normalizeAssistant(raw: unknown): AssistantConfig | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id.trim() : '';
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    if (!id || !name) return null;

    const featuresRaw = o.features && typeof o.features === 'object' && !Array.isArray(o.features)
        ? (o.features as Record<string, unknown>)
        : null;

    return {
        id,
        name,
        systemPromptPath: typeof o.systemPromptPath === 'string' ? o.systemPromptPath.trim() || null : null,
        systemPrompt: typeof o.systemPrompt === 'string' ? o.systemPrompt.trim() || null : null,
        model: typeof o.model === 'string' ? o.model.trim() || null : null,
        temperature: clampTemperature(o.temperature) ?? null,
        api: normalizeAssistantApi(o.api),
        features: featuresRaw ? {
            orderFlowEnabled: typeof featuresRaw.orderFlowEnabled === 'boolean' ? featuresRaw.orderFlowEnabled : undefined,
            financialEnabled: typeof featuresRaw.financialEnabled === 'boolean' ? featuresRaw.financialEnabled : undefined,
        } : null,
        handoffRules: normalizeHandoffRules(o.handoffRules),
        toolIds: Array.isArray(o.toolIds)
            ? (o.toolIds as unknown[]).map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean)
            : undefined,
    };
}

/** Exposto para persistência (API admin): mescla payload com defaults para escrever em arquivo. */
export function mergeWithDefaults(partial: Record<string, unknown>): TenantConfig {
    const branding = (partial.branding as Record<string, unknown>) || {};
    const api = (partial.api as Record<string, unknown>) || {};
    const prompt = (partial.prompt as Record<string, unknown>) || {};
    const features = (partial.features as Record<string, unknown>) || {};
    const assistantsRaw = partial.assistants;
    const assistants: AssistantConfig[] = Array.isArray(assistantsRaw)
        ? assistantsRaw.map(normalizeAssistant).filter((a): a is AssistantConfig => a !== null)
        : [];
    const toolsRaw = partial.tools;
    const tools: ToolConfig[] = Array.isArray(toolsRaw)
        ? toolsRaw.map(normalizeTool).filter((t): t is ToolConfig => t !== null)
        : [];

    return {
        branding: {
            companyName: ensureNonEmptyString(branding.companyName, DEFAULTS.branding.companyName),
            assistantName: ensureNonEmptyString(branding.assistantName, DEFAULTS.branding.assistantName),
            productName: typeof branding.productName === 'string' ? branding.productName : DEFAULTS.branding.productName,
        },
        api: {
            baseUrl: ensureNonEmptyString(api.baseUrl, DEFAULTS.api.baseUrl),
        },
        prompt: {
            systemPromptPath:
                typeof prompt.systemPromptPath === 'string'
                    ? prompt.systemPromptPath.trim() || null
                    : DEFAULTS.prompt.systemPromptPath,
            systemPrompt:
                typeof prompt.systemPrompt === 'string'
                    ? prompt.systemPrompt.trim() || null
                    : DEFAULTS.prompt.systemPrompt,
            greeting:
                typeof prompt.greeting === 'string'
                    ? prompt.greeting.trim() || null
                    : DEFAULTS.prompt.greeting,
            humanAgentMessage:
                typeof prompt.humanAgentMessage === 'string'
                    ? prompt.humanAgentMessage.trim() || null
                    : DEFAULTS.prompt.humanAgentMessage,
            temperature: clampTemperature(prompt.temperature) ?? DEFAULTS.prompt.temperature ?? 0.3,
            orderFlowMessages: normalizeOrderFlowMessages(prompt.orderFlowMessages) ?? DEFAULTS.prompt.orderFlowMessages,
        },
        features: {
            orderFlowEnabled: typeof features.orderFlowEnabled === 'boolean' ? features.orderFlowEnabled : DEFAULTS.features.orderFlowEnabled,
            financialEnabled: typeof features.financialEnabled === 'boolean' ? features.financialEnabled : DEFAULTS.features.financialEnabled,
        },
        assistants: assistants.length > 0 ? assistants : undefined,
        tools: tools.length > 0 ? tools : undefined,
        chatFlow: normalizeChatFlow(partial.chatFlow) ?? null,
    };
}

function applyEnvOverrides(config: TenantConfig): TenantConfig {
    const env = process.env;
    return {
        ...config,
        branding: {
            ...config.branding,
            companyName: env.COMPANY_NAME?.trim() || config.branding.companyName,
            assistantName: env.ASSISTANT_NAME?.trim() || config.branding.assistantName,
        },
        api: {
            baseUrl: ensureNonEmptyString(env.API_BASE_URL, config.api.baseUrl),
        },
        prompt: {
            ...config.prompt,
            systemPromptPath: env.SYSTEM_PROMPT_PATH?.trim() || config.prompt.systemPromptPath,
        },
    };
}

let cached: TenantConfig | null = null;
const tenantCache = new Map<string, TenantConfig>();

/** Erro quando tenantId não existe (arquivo config/tenants/{id}.json ausente). */
export class TenantNotFoundError extends Error {
    constructor(public readonly tenantId: string) {
        super(`Tenant não encontrado: ${tenantId}`);
        this.name = 'TenantNotFoundError';
    }
}

/** Apenas para testes: limpa o cache para que getConfig() releia env/arquivo. */
export function __resetConfigCache(): void {
    cached = null;
    tenantCache.clear();
}

function loadConfigFromFile(configPath: string): TenantConfig | null {
    try {
        if (!fs.existsSync(configPath)) return null;
        const raw = fs.readFileSync(configPath, 'utf8');
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const merged = mergeWithDefaults(parsed);
        return applyEnvOverrides(merged);
    } catch (err) {
        console.warn('[config] Aviso: não foi possível carregar', configPath, (err as Error).message);
        return null;
    }
}

function freezeConfig(config: TenantConfig): TenantConfig {
    return Object.freeze({
        branding: Object.freeze({ ...config.branding }),
        api: Object.freeze({ ...config.api }),
        prompt: Object.freeze({ ...config.prompt }),
        features: Object.freeze({ ...config.features }),
        assistants: config.assistants?.map((a) => Object.freeze({ ...a })),
        tools: config.tools?.map((t) => Object.freeze({ ...t })),
        chatFlow: config.chatFlow ? Object.freeze({ ...config.chatFlow, humanEscalation: config.chatFlow.humanEscalation ? Object.freeze({ ...config.chatFlow.humanEscalation }) : null }) : null,
    }) as TenantConfig;
}

/**
 * Resolve o path de um arquivo de tenant, verificando /tmp (ambiente serverless) antes do cwd.
 */
function resolveTenantFilePath(id: string): string | null {
    const cwd = process.cwd();
    const isVercel = !!(process.env.VERCEL);
    const candidates: string[] = [];

    if (isVercel) {
        // /tmp é gravável no serverless; arquivos criados em runtime ficam aqui
        candidates.push(
            id === 'default'
                ? path.join('/tmp', 'config', 'tenant.json')
                : path.join('/tmp', 'config', 'tenants', `${id}.json`)
        );
    }
    // cwd: read-only no Vercel mas contém arquivos comitados no deploy
    candidates.push(
        id === 'default'
            ? path.join(cwd, 'config', 'tenant.json')
            : path.join(cwd, 'config', 'tenants', `${id}.json`)
    );

    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

/**
 * Retorna a configuração do tenant.
 * Sem argumento ou tenantId "default": config global (config/tenant.json). Env vars sobrescrevem.
 * Com tenantId diferente: config/tenants/{tenantId}.json. Lança TenantNotFoundError se arquivo ausente.
 * Em ambientes serverless (Vercel), verifica /tmp antes do cwd para encontrar tenants criados em runtime.
 */
export function getConfig(tenantId?: string): TenantConfig {
    const id = (tenantId ?? 'default').trim() || 'default';

    if (id === 'default') {
        if (cached) return cached;
        const configPath = resolveTenantFilePath('default');
        const loaded = configPath ? loadConfigFromFile(configPath) : null;
        const config = loaded || applyEnvOverrides(DEFAULTS);
        cached = freezeConfig(config);
        return cached;
    }

    if (tenantCache.has(id)) return tenantCache.get(id)!;
    const configPath = resolveTenantFilePath(id);
    if (!configPath) {
        console.warn('[config] Tenant não encontrado:', id);
        throw new TenantNotFoundError(id);
    }
    const loaded = loadConfigFromFile(configPath);
    const config = loaded ? freezeConfig(loaded) : freezeConfig(DEFAULTS);
    tenantCache.set(id, config);
    return config;
}

/** Resultado de getAssistantConfig: dados do agente para prompt, modelo e integração de dados. */
export interface ResolvedAssistant {
    id: string;
    name: string;
    systemPromptPath?: string | null;
    systemPrompt?: string | null;
    model?: string | null;
    temperature: number;
    /** Configuração de integração de dados do agente (null = herda comportamento do tenant). */
    api: AssistantApiConfig | null;
    /** Features efetivas do agente (já com fallback para o tenant). */
    features: {
        orderFlowEnabled: boolean;
        financialEnabled: boolean;
    };
    /** Regras de transferência para outros agentes. */
    handoffRules: HandoffRules | null;
    /** IDs das tools que o agente usa (se definido; senão usa lógica por features). */
    toolIds?: string[];
}

/**
 * Retorna a config do assistente para um tenant (e opcionalmente assistantId).
 * Se o tenant não tiver assistants ou assistantId for vazio, retorna o agente default
 * (branding.assistantName + prompt do tenant).
 */
export function getAssistantConfig(tenantId: string, assistantId?: string | null): ResolvedAssistant {
    const config = getConfig(tenantId);
    const aid = (assistantId ?? '').trim();

    const defaultTemp = typeof config.prompt.temperature === 'number' && !Number.isNaN(config.prompt.temperature)
        ? Math.max(0, Math.min(2, config.prompt.temperature))
        : 0.3;

    const tenantFeatures = {
        orderFlowEnabled: config.features?.orderFlowEnabled ?? true,
        financialEnabled: config.features?.financialEnabled ?? true,
    };

    function resolveFeatures(agentFeatures: AssistantConfig['features']): { orderFlowEnabled: boolean; financialEnabled: boolean } {
        if (!agentFeatures) return tenantFeatures;
        return {
            orderFlowEnabled: agentFeatures.orderFlowEnabled ?? tenantFeatures.orderFlowEnabled,
            financialEnabled: agentFeatures.financialEnabled ?? tenantFeatures.financialEnabled,
        };
    }

    if (!config.assistants || config.assistants.length === 0 || !aid) {
        return {
            id: aid || 'default',
            name: config.branding.assistantName || 'Assistente',
            systemPromptPath: config.prompt.systemPromptPath ?? null,
            systemPrompt: config.prompt.systemPrompt ?? null,
            model: null,
            temperature: defaultTemp,
            api: null,
            features: tenantFeatures,
            handoffRules: null,
            toolIds: undefined,
        };
    }

    const aidLower = aid.toLowerCase();
    const assistant = config.assistants.find((a) => (a.id || '').toLowerCase() === aidLower);
    const target = assistant ?? config.assistants[0];
    const rawName = target.name?.trim() || '';
    const name =
        target.id === 'vendedor' && (!rawName || rawName.toLowerCase() === 'atendente')
            ? 'Vendedor'
            : rawName || config.branding?.assistantName || 'Assistente';

    let handoffRules = target.handoffRules ? normalizeHandoffRules(target.handoffRules) : null;

    // Auto-inject: se o agente é o entryAgentId e não tem handoffRules,
    // gera rotas automáticas para os demais agentes do tenant.
    if ((!handoffRules || !handoffRules.enabled || !handoffRules.routes?.length) && config.chatFlow?.entryAgentId) {
        const entryLower = config.chatFlow.entryAgentId.toLowerCase();
        const targetLower = target.id.toLowerCase();
        if (targetLower === entryLower && config.assistants.length > 1) {
            const otherAgents = config.assistants.filter((a) => (a.id || '').toLowerCase() !== entryLower);
            if (otherAgents.length > 0) {
                handoffRules = {
                    enabled: true,
                    routes: otherAgents.map((a) => ({
                        agentId: a.id,
                        label: a.name || a.id,
                        description: `Transferir para ${a.name || a.id}`,
                    })),
                };
            }
        }
    }

    return {
        id: target.id,
        name,
        systemPromptPath: target.systemPromptPath ?? null,
        systemPrompt: target.systemPrompt ?? null,
        model: target.model ?? null,
        temperature: clampTemperature(target.temperature) ?? defaultTemp,
        api: target.api ?? null,
        features: resolveFeatures(target.features),
        handoffRules,
        toolIds: Array.isArray(target.toolIds) && target.toolIds.length > 0 ? target.toolIds : undefined,
    };
}

