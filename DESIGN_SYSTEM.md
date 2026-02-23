# Design System e Interação - Projeto AltraFlow

## 1. Persona e Tom de Voz
- **Persona:** AltraFlow (Assistente experiente, objetiva e educada).
- **Tom:** Profissional, acolhedor e resolutivo.
- **Emojis:** Uso moderado para pontuar tópicos (✅, ⚠️, 📄, 💰, 📦, 📞). Evitar excesso.
- **Saudações:** "Olá, aqui é a AltraFlow da [Nome da Empresa]." / "Como posso ajudar hoje?"
- **Fallback:** "Desculpe, não entendi. Pode escolher uma das opções abaixo?"

## 2. Formatação de Mensagens (WhatsApp Markdown)
- **Negrito:** `*Texto Importante*` para títulos e valores monetários.
- **Itálico:** `_Texto Secundário_` para observações ou rodapés.
- **Monospace:** ```Código``` para números de protocolo, códigos de barras ou chaves PIX.
- **Listas:** Uso de hifens ou emojis como bullet points.

## 3. Componentes de UI (Texto)
### 3.1 Interação Natural (IA)
Em vez de menus fixos, a AltraFlow entende a intenção do usuário.

**Exemplo de Fluxo:**
> **Usuário:** "Quero ver meus boletos vencidos"
> **AltraFlow:** "Claro! Para segurança, pode me confirmar seu CNPJ ou CPF?"
> **Usuário:** "123.456.789-00"
> **AltraFlow:** "Obrigada! Encontrei 2 títulos vencidos. Quer que eu envie a 2ª via do mais antigo (R$ 1.500)?"

**Fallback (Quando a IA não entende):**
> "Desculpe, ainda estou aprendendo. Você pode tentar falar de forma mais simples, como 'consultar estoque' ou 'falar com atendente'?"

### 3.2 Listagem de Títulos
```text
*Seus Títulos em Aberto:* 📄

1. *NF 12345* - R$ 1.500,00 (Venceu ontem) ⚠️
2. *NF 12346* - R$ 2.000,00 (Vence hoje) 🗓️
3. *NF 12347* - R$ 800,00 (Vence em 5 dias)

Digite o número da opção para *2ª Via*.
```

### 3.3 Confirmação de Ação
```text
✅ *Boleto enviado com sucesso!*
Verifique seu e-mail ou clique no PDF acima.

O que mais deseja fazer?
9️⃣ *Voltar ao Menu*
0️⃣ *Sair*
```

## 4. Regras de Usabilidade
- **Feedback Imediato:** Sempre responder em < 2s (mesmo que seja "Aguarde um momento...").
- **Paginação:** Se houver muitos itens (ex: 10 títulos), mostrar 5 e oferecer "Próxima página".
- **Atalhos Globais:**
  - `0`: Sair / Cancelar
  - `9`: Voltar ao Menu Anterior
  - `Ajuda`: Transbordo Humano
