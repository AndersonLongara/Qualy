/**
 * Teste E2E — Fluxo completo com detecção de intenção + state machine.
 * Roda contra o servidor mock local (localhost:3000).
 * 
 * Uso: npx ts-node scripts/test-ai-flow.ts
 */
import axios from 'axios';

const API = 'http://localhost:3000/api/chat';
const PHONE = `test-${Date.now()}`; // Sessão limpa

interface TestCase {
    label: string;
    input: string;
    expect: (reply: string) => boolean;
    expectDescription: string;
}

const tests: TestCase[] = [
    {
        label: '1. Saudação',
        input: 'Oi',
        expect: (r) => r.toLowerCase().includes('olá') || r.toLowerCase().includes('ajudar'),
        expectDescription: 'Saudação cordial (contém "olá" ou "ajudar")',
    },
    {
        label: '2. Consulta de Estoque (LLM + Tool)',
        input: 'Qual o estoque do produto PROD-001?',
        expect: (r) => r.includes('500') && (r.includes('29') || r.includes('R$')),
        expectDescription: 'Contém "500" e preço ~29',
    },
    {
        label: '3. Iniciar Pedido (State Machine)',
        input: 'Quero fazer um pedido deste produto',
        expect: (r) => r.toLowerCase().includes('cpf') || r.toLowerCase().includes('cnpj'),
        expectDescription: 'Pede CPF/CNPJ (state machine)',
    },
    {
        label: '4. Fornecer CPF (State Machine)',
        input: '12345678000190',
        expect: (r) => r.toLowerCase().includes('mercadinho') || r.toLowerCase().includes('quantidade'),
        expectDescription: 'Valida cliente e pede quantidade',
    },
    {
        label: '5. Fornecer Quantidade (State Machine)',
        input: '100',
        expect: (r) => r.includes('100') && (r.toLowerCase().includes('confirma') || r.toLowerCase().includes('pedido')),
        expectDescription: 'Mostra resumo e pede confirmação',
    },
    {
        label: '6. Confirmar Pedido (State Machine)',
        input: 'sim',
        expect: (r) => r.toLowerCase().includes('encaminhado') || r.toLowerCase().includes('equipe'),
        expectDescription: 'Confirma encaminhamento do pedido',
    },
];

async function runTests() {
    console.log('═══════════════════════════════════════');
    console.log('  TESTE E2E — Intent + State Machine');
    console.log('═══════════════════════════════════════\n');

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
        try {
            console.log(`📝 ${test.label}: "${test.input}"`);
            const res = await axios.post(API, { message: test.input, phone: PHONE });
            const reply = res.data.reply || '(vazio)';

            console.log(`   💬 Resposta: "${reply.substring(0, 150)}${reply.length > 150 ? '...' : ''}"`);

            if (test.expect(reply)) {
                console.log(`   ✅ PASS — ${test.expectDescription}\n`);
                passed++;
            } else {
                console.log(`   ❌ FAIL — Esperava: ${test.expectDescription}\n`);
                failed++;
            }
        } catch (err: any) {
            console.log(`   ❌ ERRO — ${err.message}\n`);
            failed++;
        }
    }

    console.log('═══════════════════════════════════════');
    console.log(`  Resultado: ${passed}/${tests.length} PASS | ${failed} FAIL`);
    console.log('═══════════════════════════════════════');
    process.exit(failed > 0 ? 1 : 0);
}

runTests();
