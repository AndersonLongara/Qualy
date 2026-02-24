/**
 * Rotas de administração: CRUD de tenants (empresas) e, dentro deles, assistentes (agentes).
 * Protegidas por requireAdminKey (X-Admin-Key ou Authorization: Bearer).
 */
import { Router, Request, Response } from 'express';
import { requireAdminKey } from './adminMiddleware';
import { listAllTenantIds, getTenantConfig, getTenantRaw, writeTenant, deleteTenant, ensureTenantLoaded } from './tenantStorage';
import { usageStore } from './usageStore';
import { TenantNotFoundError, getConfig, mergeWithDefaults, type ToolConfig } from '../config/tenant';
import { generateWhatsAppAgentPrompt, incrementPrompt } from './generateSystemPrompt';
import { generateMockData } from './generateMockData';
import { AGENT_TEMPLATES } from '../config/agentTemplates';
import { executeTool, getBuiltinToolsConfig, BUILTIN_TOOL_KEYS } from '../core/ai/tools';
import { executionStore } from './executionStore';

const router = Router();
router.use(requireAdminKey);

/** GET /api/admin/tenants — lista IDs dos tenants (filesystem + Postgres). */
router.get('/tenants', async (_req: Request, res: Response) => {
    try {
        const ids = await listAllTenantIds();
        return res.json({ tenants: ids });
    } catch (err: any) {
        console.error('[admin] list tenants:', err);
        return res.status(500).json({ error: err?.message || 'Erro ao listar tenants.' });
    }
});

function paramId(req: Request, key: string): string {
    const p = req.params[key];
    return (typeof p === 'string' ? p : (Array.isArray(p) ? p[0] : '') ?? '').trim();
}

/** GET /api/admin/tenants/:id — detalhe do tenant (config + assistants). */
router.get('/tenants/:id', async (req: Request, res: Response) => {
    const id = paramId(req, 'id');
    if (!id) return res.status(400).json({ error: 'ID do tenant é obrigatório.' });
    try {
        await ensureTenantLoaded(id);
        const config = getTenantConfig(id);
        return res.json(config);
    } catch (err: any) {
        if (err?.name === 'TenantNotFoundError') {
            return res.status(404).json({ error: 'Tenant não encontrado', code: 'TENANT_NOT_FOUND' });
        }
        console.error('[admin] get tenant:', err);
        return res.status(500).json({ error: err?.message || 'Erro ao obter tenant.' });
    }
});

/** POST /api/admin/tenants — cria tenant. Body: { id?, branding, api?, features?, assistants? }. */
router.post('/tenants', async (req: Request, res: Response) => {
    const body = req.body || {};
    const id = (body.id ?? body.tenantId ?? '').trim();
    if (!id) return res.status(400).json({ error: 'Campo "id" (ou "tenantId") é obrigatório para criar tenant.' });
    if (id === 'default') return res.status(400).json({ error: 'Não é permitido criar tenant com id "default" via POST; use PATCH para atualizar o default.' });
    try {
        await writeTenant(id, body);
        const config = getTenantConfig(id);
        return res.status(201).json(config);
    } catch (err: any) {
        if (err?.name === 'TenantNotFoundError') return res.status(404).json({ error: err.message });
        console.error('[admin] create tenant:', err);
        return res.status(400).json({ error: err?.message || 'Erro ao criar tenant.' });
    }
});

/** GET /api/admin/conversations — lista sessões (conversas) por tenant — só admin, para histórico e debug. */
router.get('/conversations', async (req: Request, res: Response) => {
    const tenantId = (req.query.tenantId as string)?.trim() || (req.headers['x-tenant-id'] as string)?.trim() || 'default';
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit), 10) || 50));
    const offset = Math.max(0, parseInt(String(req.query.offset), 10) || 0);
    try {
        const result = await executionStore.listSessions({ tenantId, limit, offset });
        return res.json(result);
    } catch (err: any) {
        console.error('[admin] list conversations:', err);
        return res.status(500).json({ error: err?.message || 'Erro ao listar conversas.' });
    }
});

/** GET /api/admin/conversations/by-session — mensagens de uma sessão (tenantId + phone) — só admin. */
router.get('/conversations/by-session', async (req: Request, res: Response) => {
    const tenantId = (req.query.tenantId as string)?.trim() || (req.headers['x-tenant-id'] as string)?.trim() || 'default';
    const phone = (req.query.phone as string)?.trim();
    if (!phone) return res.status(400).json({ error: 'phone é obrigatório (query).', code: 'MISSING_PHONE' });
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit), 10) || 100));
    try {
        const result = await executionStore.listBySession({ tenantId, phone, limit });
        return res.json(result);
    } catch (err: any) {
        console.error('[admin] get conversation:', err);
        return res.status(500).json({ error: err?.message || 'Erro ao obter conversa.' });
    }
});

/** GET /api/admin/agent-templates — perfis predefinidos de agentes para criação rápida. */
router.get('/agent-templates', (_req: Request, res: Response) => {
    return res.json({ templates: AGENT_TEMPLATES });
});

/** POST /api/admin/generate-system-prompt — refina o prompt já escrito (mais profissional, Markdown), sem acrescentar funções. */
router.post('/generate-system-prompt', async (req: Request, res: Response) => {
    const body = req.body || {};
    const currentPrompt = typeof body.currentPrompt === 'string' ? body.currentPrompt : undefined;
    const agentName = typeof body.agentName === 'string' ? body.agentName.trim() : undefined;
    const companyName = typeof body.companyName === 'string' ? body.companyName.trim() : undefined;
    try {
        const systemPrompt = await generateWhatsAppAgentPrompt({ currentPrompt, agentName, companyName });
        return res.json({ systemPrompt });
    } catch (err: any) {
        console.error('[admin] generate-system-prompt:', err);
        return res.status(500).json({
            error: err?.message || 'Erro ao gerar prompt com IA.',
            code: 'GENERATE_PROMPT_ERROR',
        });
    }
});

/** POST /api/admin/increment-prompt — adiciona uma instrução ao prompt atual sem perder o existente. */
router.post('/increment-prompt', async (req: Request, res: Response) => {
    const body = req.body || {};
    const currentPrompt = typeof body.currentPrompt === 'string' ? body.currentPrompt.trim() : '';
    const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : '';
    const agentName = typeof body.agentName === 'string' ? body.agentName.trim() : undefined;
    const companyName = typeof body.companyName === 'string' ? body.companyName.trim() : undefined;
    if (!currentPrompt || !instruction) {
        return res.status(400).json({
            error: 'Envie currentPrompt e instruction no body.',
            code: 'MISSING_FIELDS',
        });
    }
    try {
        const systemPrompt = await incrementPrompt({ currentPrompt, instruction, agentName, companyName });
        return res.json({ systemPrompt });
    } catch (err: any) {
        console.error('[admin] increment-prompt:', err);
        return res.status(500).json({
            error: err?.message || 'Erro ao incrementar prompt com IA.',
            code: 'INCREMENT_PROMPT_ERROR',
        });
    }
});

/**
 * POST /api/admin/generate-mock-data
 * Body: { description: string, section: 'clientes' | 'titulos' | 'pedidos' | 'estoque' }
 * Response: { data: object | array }
 */
router.post('/generate-mock-data', async (req: Request, res: Response) => {
    const body = req.body || {};
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const section = typeof body.section === 'string' ? body.section.trim() : '';
    const validSections = ['clientes', 'titulos', 'pedidos', 'estoque'] as const;
    type Section = typeof validSections[number];
    if (!description) return res.status(400).json({ error: 'Campo "description" é obrigatório.', code: 'MISSING_DESCRIPTION' });
    if (!validSections.includes(section as Section)) {
        return res.status(400).json({ error: `Campo "section" deve ser um de: ${validSections.join(', ')}.`, code: 'INVALID_SECTION' });
    }
    try {
        const data = await generateMockData({ description, section: section as Section });
        return res.json({ data });
    } catch (err: any) {
        console.error('[admin] generate-mock-data:', err);
        return res.status(500).json({ error: err?.message || 'Erro ao gerar dados mock com IA.', code: 'GENERATE_MOCK_ERROR' });
    }
});

/**
 * POST /api/admin/tenants/:id/assistants — adiciona um novo agente atomicamente.
 * Lê a lista atual do servidor e insere o novo agente, garantindo que os existentes não sejam perdidos.
 */
router.post('/tenants/:id/assistants', async (req: Request, res: Response) => {
    const id = paramId(req, 'id');
    if (!id) return res.status(400).json({ error: 'ID do tenant é obrigatório.' });
    const body = req.body || {};
    const newAssistant = body.assistant;
    if (!newAssistant || typeof newAssistant !== 'object' || !newAssistant.id || !newAssistant.name) {
        return res.status(400).json({ error: 'Campo "assistant" com "id" e "name" é obrigatório.' });
    }
    try {
        await ensureTenantLoaded(id);
        const current = getTenantRaw(id) as any;
        const currentAssistants: unknown[] = Array.isArray(current.assistants) ? current.assistants : [];
        if (currentAssistants.some((a: any) => a?.id === newAssistant.id)) {
            return res.status(409).json({ error: 'Já existe um agente com este ID.', code: 'AGENT_ID_CONFLICT' });
        }
        const merged = {
            branding: current.branding,
            api: current.api,
            prompt: current.prompt,
            features: current.features,
            assistants: [...currentAssistants, newAssistant],
            ...(current.chatFlow ? { chatFlow: current.chatFlow } : {}),
        };
        await writeTenant(id, merged);
        const config = getTenantConfig(id);
        return res.status(201).json(config);
    } catch (err: any) {
        if (err?.name === 'TenantNotFoundError') {
            return res.status(404).json({ error: 'Tenant não encontrado', code: 'TENANT_NOT_FOUND' });
        }
        console.error('[admin] add assistant:', err);
        return res.status(400).json({ error: err?.message || 'Erro ao adicionar agente.' });
    }
});

/** PATCH /api/admin/tenants/:id — atualiza tenant (merge com existente). */
router.patch('/tenants/:id', async (req: Request, res: Response) => {
    const id = paramId(req, 'id');
    if (!id) return res.status(400).json({ error: 'ID do tenant é obrigatório.' });
    const body = req.body || {};
    try {
        await ensureTenantLoaded(id);
        const current = getTenantRaw(id) as any;
        const merged = {
            branding: { ...current.branding, ...body.branding },
            api: { ...current.api, ...body.api },
            prompt: { ...current.prompt, ...body.prompt },
            features: { ...current.features, ...body.features },
            assistants: body.assistants !== undefined ? body.assistants : current.assistants,
            tools: body.tools !== undefined ? body.tools : current.tools,
            chatFlow: body.chatFlow !== undefined ? body.chatFlow : current.chatFlow,
        };
        await writeTenant(id, merged);
        const config = getTenantConfig(id);
        return res.json(config);
    } catch (err: any) {
        if (err?.name === 'TenantNotFoundError') {
            return res.status(404).json({ error: 'Tenant não encontrado', code: 'TENANT_NOT_FOUND' });
        }
        console.error('[admin] patch tenant:', err);
        return res.status(400).json({ error: err?.message || 'Erro ao atualizar tenant.' });
    }
});

/** GET /api/admin/tenants/:id/tools — lista tools do tenant (built-ins + custom). */
router.get('/tenants/:id/tools', async (req: Request, res: Response) => {
    const id = paramId(req, 'id');
    if (!id) return res.status(400).json({ error: 'ID do tenant é obrigatório.' });
    try {
        await ensureTenantLoaded(id);
        const config = getTenantConfig(id);
        const builtins = getBuiltinToolsConfig();
        const custom = config.tools || [];
        return res.json({ tools: [...builtins, ...custom] });
    } catch (err: any) {
        if (err?.name === 'TenantNotFoundError') {
            return res.status(404).json({ error: 'Tenant não encontrado', code: 'TENANT_NOT_FOUND' });
        }
        console.error('[admin] get tools:', err);
        return res.status(500).json({ error: err?.message || 'Erro ao listar tools.' });
    }
});

/** POST /api/admin/tenants/:id/tools — adiciona uma tool custom ao tenant. */
router.post('/tenants/:id/tools', async (req: Request, res: Response) => {
    const id = paramId(req, 'id');
    if (!id) return res.status(400).json({ error: 'ID do tenant é obrigatório.' });
    const body = req.body || {};
    const toolPayload = body.tool ?? body;
    const merged = mergeWithDefaults({ tools: [toolPayload] });
    const newTool = merged.tools?.[0];
    if (!newTool) return res.status(400).json({ error: 'Payload de tool inválido (id, name, description, parameters, execution).', code: 'INVALID_TOOL' });
    if (BUILTIN_TOOL_KEYS.includes(newTool.id as any)) {
        return res.status(400).json({ error: 'Não é permitido criar tool com id de built-in. Use outro id.', code: 'BUILTIN_ID_CONFLICT' });
    }
    try {
        await ensureTenantLoaded(id);
        const current = getTenantRaw(id) as any;
        const currentTools: ToolConfig[] = Array.isArray(current.tools) ? current.tools : [];
        if (currentTools.some((t) => t.id === newTool.id)) {
            return res.status(409).json({ error: 'Já existe uma tool com este ID.', code: 'TOOL_ID_CONFLICT' });
        }
        const mergedWrite = {
            branding: current.branding,
            api: current.api,
            prompt: current.prompt,
            features: current.features,
            assistants: current.assistants,
            tools: [...currentTools, newTool],
            ...(current.chatFlow ? { chatFlow: current.chatFlow } : {}),
        };
        await writeTenant(id, mergedWrite);
        const config = getTenantConfig(id);
        return res.status(201).json(config);
    } catch (err: any) {
        if (err?.name === 'TenantNotFoundError') {
            return res.status(404).json({ error: 'Tenant não encontrado', code: 'TENANT_NOT_FOUND' });
        }
        console.error('[admin] add tool:', err);
        return res.status(400).json({ error: err?.message || 'Erro ao adicionar tool.' });
    }
});

/** PATCH /api/admin/tenants/:id/tools/:toolId — atualiza uma tool (só custom). */
router.patch('/tenants/:id/tools/:toolId', async (req: Request, res: Response) => {
    const id = paramId(req, 'id');
    const toolId = paramId(req, 'toolId');
    if (!id || !toolId) return res.status(400).json({ error: 'ID do tenant e toolId são obrigatórios.' });
    if (BUILTIN_TOOL_KEYS.includes(toolId as any)) {
        return res.status(400).json({ error: 'Não é permitido editar tool built-in.', code: 'BUILTIN_READONLY' });
    }
    const body = req.body || {};
    const merged = mergeWithDefaults({ tools: [{ ...body, id: toolId }] });
    const updatedTool = merged.tools?.[0];
    if (!updatedTool) return res.status(400).json({ error: 'Payload de tool inválido.', code: 'INVALID_TOOL' });
    try {
        await ensureTenantLoaded(id);
        const current = getTenantRaw(id) as any;
        const currentTools: ToolConfig[] = Array.isArray(current.tools) ? current.tools : [];
        const idx = currentTools.findIndex((t) => t.id === toolId);
        if (idx < 0) return res.status(404).json({ error: 'Tool não encontrada.', code: 'TOOL_NOT_FOUND' });
        const newTools = [...currentTools];
        newTools[idx] = updatedTool;
        const mergedWrite = {
            branding: current.branding,
            api: current.api,
            prompt: current.prompt,
            features: current.features,
            assistants: current.assistants,
            tools: newTools,
            ...(current.chatFlow ? { chatFlow: current.chatFlow } : {}),
        };
        await writeTenant(id, mergedWrite);
        const config = getTenantConfig(id);
        return res.json(config);
    } catch (err: any) {
        if (err?.name === 'TenantNotFoundError') {
            return res.status(404).json({ error: 'Tenant não encontrado', code: 'TENANT_NOT_FOUND' });
        }
        console.error('[admin] patch tool:', err);
        return res.status(400).json({ error: err?.message || 'Erro ao atualizar tool.' });
    }
});

/** DELETE /api/admin/tenants/:id/tools/:toolId — remove uma tool (só custom). */
router.delete('/tenants/:id/tools/:toolId', async (req: Request, res: Response) => {
    const id = paramId(req, 'id');
    const toolId = paramId(req, 'toolId');
    if (!id || !toolId) return res.status(400).json({ error: 'ID do tenant e toolId são obrigatórios.' });
    if (BUILTIN_TOOL_KEYS.includes(toolId as any)) {
        return res.status(400).json({ error: 'Não é permitido remover tool built-in.', code: 'BUILTIN_READONLY' });
    }
    try {
        await ensureTenantLoaded(id);
        const current = getTenantRaw(id) as any;
        const currentTools: ToolConfig[] = Array.isArray(current.tools) ? current.tools : [];
        const newTools = currentTools.filter((t) => t.id !== toolId);
        if (newTools.length === currentTools.length) return res.status(404).json({ error: 'Tool não encontrada.', code: 'TOOL_NOT_FOUND' });
        const mergedWrite = {
            branding: current.branding,
            api: current.api,
            prompt: current.prompt,
            features: current.features,
            assistants: current.assistants,
            tools: newTools,
            ...(current.chatFlow ? { chatFlow: current.chatFlow } : {}),
        };
        await writeTenant(id, mergedWrite);
        const config = getTenantConfig(id);
        return res.json(config);
    } catch (err: any) {
        if (err?.name === 'TenantNotFoundError') {
            return res.status(404).json({ error: 'Tenant não encontrado', code: 'TENANT_NOT_FOUND' });
        }
        console.error('[admin] delete tool:', err);
        return res.status(400).json({ error: err?.message || 'Erro ao remover tool.' });
    }
});

/** POST /api/admin/tenants/:id/tools/:toolId/test — executa a tool com args e retorna output. */
router.post('/tenants/:id/tools/:toolId/test', async (req: Request, res: Response) => {
    const id = paramId(req, 'id');
    const toolId = paramId(req, 'toolId');
    if (!id || !toolId) return res.status(400).json({ error: 'ID do tenant e toolId são obrigatórios.' });
    const args: Record<string, unknown> = typeof req.body?.args === 'object' && req.body.args !== null ? req.body.args : {};
    try {
        await ensureTenantLoaded(id);
        const config = getTenantConfig(id);
        const builtins = getBuiltinToolsConfig();
        const custom = config.tools || [];
        const tool = builtins.find((t) => t.id === toolId) ?? custom.find((t) => t.id === toolId);
        if (!tool) return res.status(404).json({ error: 'Tool não encontrada.', code: 'TOOL_NOT_FOUND' });
        const firstAssistantId = Array.isArray(config.assistants) && config.assistants.length > 0 ? config.assistants[0].id : null;
        const output = await executeTool(id, firstAssistantId, tool, args);
        return res.json({ output });
    } catch (err: any) {
        console.error('[admin] tool test:', err);
        return res.status(500).json({ error: err?.message || 'Erro ao executar tool.', output: undefined });
    }
});

/** GET /api/admin/usage — uso de tokens e custo estimado por empresa (from/to em ISO). */
router.get('/usage', async (req: Request, res: Response) => {
    const from = typeof req.query.from === 'string' ? req.query.from.trim() : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to.trim() : undefined;
    try {
        const ids = await listAllTenantIds();
        const tenantUsages = await Promise.all(ids.map(async (tenantId) => {
            const totals = await usageStore.getTotalsWithCost(tenantId, from, to);
            let companyName = tenantId;
            try {
                await ensureTenantLoaded(tenantId);
                const config = tenantId === 'default' ? getConfig('default') : getTenantConfig(tenantId);
                companyName = config?.branding?.companyName ?? tenantId;
            } catch {
                // ignore
            }
            return {
                tenantId,
                companyName,
                prompt_tokens: totals.prompt_tokens,
                completion_tokens: totals.completion_tokens,
                total_tokens: totals.total_tokens,
                estimated_cost_usd: Math.round(totals.estimated_cost_usd * 10000) / 10000,
            };
        }));
        return res.json({ tenants: tenantUsages });
    } catch (err: any) {
        console.error('[admin] usage:', err);
        return res.status(500).json({ error: err?.message || 'Erro ao listar uso.' });
    }
});

/** DELETE /api/admin/tenants/:id — remove tenant. */
router.delete('/tenants/:id', async (req: Request, res: Response) => {
    const id = paramId(req, 'id');
    if (!id) return res.status(400).json({ error: 'ID do tenant é obrigatório.' });
    try {
        await deleteTenant(id);
        return res.status(204).send();
    } catch (err: any) {
        if (err?.name === 'TenantNotFoundError') {
            return res.status(404).json({ error: 'Tenant não encontrado', code: 'TENANT_NOT_FOUND' });
        }
        console.error('[admin] delete tenant:', err);
        return res.status(400).json({ error: err?.message || 'Erro ao remover tenant.' });
    }
});

export const adminRouter = router;
