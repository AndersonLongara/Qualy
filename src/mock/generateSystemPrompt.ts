/**
 * Expande a ideia do usuário em um prompt de sistema completo e profissional (Markdown):
 * identidade, tom de voz, regras de conduta, formato WhatsApp, instruções específicas.
 * Não inventa funções de negócio não citadas. Usado pelo botão "Refinar com IA".
 */
import OpenAI from 'openai';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash-lite';

export interface GeneratePromptOptions {
    /** Texto já escrito na caixa: a IA segue essa ideia e só melhora a redação. */
    currentPrompt?: string;
    agentName?: string;
    companyName?: string;
}

const SYSTEM_INSTRUCTION = `Você é um especialista em redação de prompts de sistema para agentes de IA de atendimento no WhatsApp.

Sua tarefa é pegar a ideia que o usuário escreveu e transformá-la em um prompt de sistema COMPLETO e PROFISSIONAL, em Markdown, para o modelo de linguagem entender e seguir com clareza.

Estrutura OBRIGATÓRIA do prompt (use exatamente estes títulos em Markdown para a IA interpretar melhor):

# Identidade e papel
- Quem é o agente (nome), de qual empresa, e qual o papel principal com base no que o usuário descreveu.

# Tom de voz
- Profissional, cordial, objetivo, adequado a atendimento por chat/WhatsApp.
- Especificar: linguagem clara, mensagens diretas, uso moderado de emojis, evitar jargões.

# Regras de conduta
- Ser conciso; não inventar informações; quando não souber, direcionar para humano ou setor adequado.
- Manter contexto da conversa; não repetir perguntas já respondidas.

# Formato e boas práticas (WhatsApp)
- Respostas em blocos curtos quando possível; listas quando fizer sentido; uma pergunta de acompanhamento ao final para manter o fluxo.

# Instruções específicas
- Aqui você desenvolve em tópicos (Markdown) exatamente o que o usuário pediu no texto dele (ex.: direcionar para setores, triagem, etc.). NÃO invente funções de negócio que ele não citou (vendas, estoque, financeiro, etc.) — apenas expanda de forma profissional o que já está sugerido.

Regras gerais:
- Todo o prompt em português brasileiro.
- Use Markdown de verdade: # e ## para títulos, - para listas, ** para ênfase. Isso ajuda o modelo a entender a estrutura.
- Seja generoso na redação: um prompt bem escrito e completo guia melhor a IA. Desenvolva cada seção com 2 a 5 tópicos claros.
- Retorne APENAS o prompt final, sem explicações antes ou depois.`;

export async function generateWhatsAppAgentPrompt(options: GeneratePromptOptions): Promise<string> {
    if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY.trim() === '') {
        throw new Error('OPENROUTER_API_KEY não configurada. Configure em .env.local para usar a geração por IA.');
    }

    const currentPrompt = (options.currentPrompt ?? '').trim();
    const agentName = (options.agentName ?? '').trim() || 'Assistente';
    const companyName = (options.companyName ?? '').trim() || 'a empresa';

    const openai = new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: OPENROUTER_API_KEY,
    });

    const userMessage = currentPrompt
        ? `Transforme a ideia abaixo em um prompt de sistema COMPLETO e PROFISSIONAL, seguindo a estrutura em Markdown (Identidade, Tom de voz, Regras de conduta, Formato WhatsApp, Instruções específicas). Desenvolva cada seção; defina tom de voz e regras de forma clara. Mantenha o escopo: só expanda o que está sugerido no texto — não invente funções de negócio que o usuário não citou.

- Nome do agente: ${agentName}
- Empresa: ${companyName}

--- Ideia / texto atual do usuário ---
${currentPrompt}
--- Fim ---`
        : `Gere um prompt de sistema COMPLETO e PROFISSIONAL para um agente de atendimento no WhatsApp cujo papel é direcionar o cliente para os setores correspondentes. Use a estrutura em Markdown: # Identidade e papel, # Tom de voz, # Regras de conduta, # Formato e boas práticas (WhatsApp), # Instruções específicas. Desenvolva cada seção com clareza. Nome do agente: ${agentName}. Empresa: ${companyName}. Não adicione funções como vendas, estoque ou financeiro — apenas triagem/direcionamento.`;

    const completion = await openai.chat.completions.create({
        model: OPENROUTER_MODEL,
        messages: [
            { role: 'system', content: SYSTEM_INSTRUCTION },
            { role: 'user', content: userMessage },
        ],
        temperature: 0.4,
        max_tokens: 4096,
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) {
        throw new Error('A IA não retornou um prompt. Tente novamente.');
    }
    return content;
}

/** Opções para incrementar o prompt: adicionar uma nova regra/instrução sem perder o que já existe. */
export interface IncrementPromptOptions {
    /** Prompt atual completo (será preservado). */
    currentPrompt: string;
    /** Instrução do usuário do que deseja adicionar (ex.: "identificar a intenção e enviar para o setor correspondente"). */
    instruction: string;
    agentName?: string;
    companyName?: string;
}

const INCREMENT_SYSTEM = `Você é um especialista em prompts para agentes de IA de atendimento no WhatsApp.

Sua tarefa é INCREMENTAR o prompt existente com a nova instrução pedida pelo usuário, SEM remover nem reescrever o que já está no prompt.

Regras OBRIGATÓRIAS:
1. Mantenha TODO o texto atual do prompt. Não apague nenhuma seção nem parágrafo.
2. Adicione a nova regra/instrução de forma profissional, em Markdown, integrada ao estilo do prompt (mesma estrutura: # títulos, - listas).
3. Se a instrução se encaixar em uma seção existente (ex.: "Instruções específicas" ou "Regras de conduta"), acrescente lá. Se precisar, crie uma subseção (##) ou um novo tópico na lista.
4. Redija a parte nova de forma clara e profissional, em português brasileiro.
5. Retorne APENAS o prompt completo (o que já existia + o incremento), sem explicações antes ou depois.`;

export async function incrementPrompt(options: IncrementPromptOptions): Promise<string> {
    if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY.trim() === '') {
        throw new Error('OPENROUTER_API_KEY não configurada. Configure em .env.local para usar a geração por IA.');
    }
    const currentPrompt = (options.currentPrompt ?? '').trim();
    const instruction = (options.instruction ?? '').trim();
    if (!currentPrompt || !instruction) {
        throw new Error('É necessário informar o prompt atual e a instrução a ser adicionada.');
    }

    const openai = new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: OPENROUTER_API_KEY,
    });

    const userMessage = `Adicione ao prompt abaixo a seguinte instrução, de forma profissional, sem remover nada do que já está escrito.

--- INSTRUÇÃO A INCREMENTAR ---
${instruction}
--- FIM DA INSTRUÇÃO ---

--- PROMPT ATUAL (manter tudo) ---
${currentPrompt}
--- FIM DO PROMPT ---

Retorne o prompt completo (atual + o novo trecho integrado em Markdown).`;

    const completion = await openai.chat.completions.create({
        model: OPENROUTER_MODEL,
        messages: [
            { role: 'system', content: INCREMENT_SYSTEM },
            { role: 'user', content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 4096,
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) {
        throw new Error('A IA não retornou o prompt. Tente novamente.');
    }
    return content;
}
