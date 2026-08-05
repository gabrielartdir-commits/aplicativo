import { NextRequest, NextResponse } from "next/server";
import { monthRepository } from "@/services/repositories/month-repository";
import { budgetRepository } from "@/services/repositories/budget-repository";
import { chatCompletion } from "@/lib/ai";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, monthId } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "A mensagem é obrigatória." },
        { status: 400 }
      );
    }

    // 1. Fetch finance details
    let month = null;
    if (monthId) {
      const allMonths = await monthRepository.list();
      month = allMonths.find((m) => m.id === monthId) || null;
    } else {
      const now = new Date();
      month = await monthRepository.findByYearMonth(
        now.getFullYear(),
        now.getMonth() + 1
      );
    }

    if (!month) {
      return NextResponse.json({ error: "Mês não encontrado." }, { status: 400 });
    }

    const budgets = await budgetRepository.listByMonth(month.id);

    // 2. Build system prompt
    const categoriesContext = budgets
      .map(
        (b) =>
          `- ${b.category.name} (${b.category.emoji}): Limite de R$ ${b.current_limit}, Gasto: R$ ${b.spent}, Restante: R$ ${b.remaining}`
      )
      .join("\n");

    const systemPrompt = `Você é o simulador financeiro do BudgetOS.
Seu objetivo é ajudar o usuário a simular decisões financeiras sem alterar nada no banco de dados real.
Sempre utilize os dados do usuário para prever impactos de compras, viagens, reduções de aportes ou remanejamentos.

DADOS FINANCEIROS ATUAIS:
- Saldo Bancário Atual: R$ ${month.bank_balance}
- Saldo Disponível para Gastar: R$ ${month.available_balance}
- Investimento Mensal Planejado: R$ ${month.reserved_investment}
- Orçamento por Categoria:
${categoriesContext}

DIRETRIZES DE RESPOSTA:
1. Nunca responda apenas com "Sim" ou "Não". Sempre dê uma explicação detalhada e embasada nos dados reais.
2. Mostre o impacto estruturado:
   - Valor do gasto/ação simulado.
   - Categorias diretamente afetadas.
   - Quanto restará de saldo disponível após o gasto.
   - Se é prudente esperar, alternativas de corte ou remanejamentos sugeridos (ex: transferir R$ X da categoria A para a B).
3. Use formatação Markdown limpa e espaçada.
4. Finalize a resposta com uma linha divisória e uma seção estruturada do fluxo de simulação, simulando caixas ou nós visuais usando caracteres ou emojis:
   Exemplo:
   [🛒 Monitor R$ 1.500] ➔ [📂 Categoria: Lazer] ➔ [📉 Saldo Disponível: R$ 300] ➔ [💡 Sugestão: Remanejar R$ 200 de Restaurantes]
`;

    const reply = await chatCompletion({
      systemPrompt,
      userMessage: message,
      temperature: 0.2,
    });

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Erro na rota de simulações:", error);
    const msg = error instanceof Error ? error.message : "Erro interno.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
