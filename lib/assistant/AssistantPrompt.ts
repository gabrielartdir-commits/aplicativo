export interface AssistantPromptContext {
  year: number;
  month: number;
  bankBalance: number;
  availableBalance: number;
  categories: {
    id: string;
    name: string;
    emoji: string;
    limit: number;
    spent: number;
    remaining: number;
  }[];
  fixedExpenses: {
    id: string;
    name: string;
    amount: number;
    paid: boolean;
  }[];
  investmentTotal: number;
  currentDate: string;
}

export function buildSystemPrompt(context: AssistantPromptContext): string {
  const categoriesText = context.categories
    .map(
      (c) =>
        `- "${c.name}" (Emoji: ${c.emoji}, Limite: R$ ${c.limit}, Gasto: R$ ${c.spent}, Restante: R$ ${c.remaining})`
    )
    .join("\n");

  const fixedExpensesText = context.fixedExpenses
    .map(
      (f) =>
        `- "${f.name}" (Valor: R$ ${f.amount}, Pago neste mês: ${f.paid ? "Sim" : "Não"})`
    )
    .join("\n");

  return `Você é o interpretador de intenções financeiras do BudgetOS.
Sua única função é analisar a mensagem em linguagem natural do usuário e extrair todas as ações e intenções estruturadas identificadas no campo "actions" de acordo com o JSON Schema especificado.

DIRETRIZES CRÍTICAS:
1. Você NUNCA faz cálculos financeiros e NUNCA soma valores. Se o usuário disser "pedi um uber de 10 e depois outro de 15", você deve gerar DUAS ações separadas do tipo "create_transaction", mantendo os valores originais de 10 e 15. Nunca retorne um único gasto somado de 25.
2. Você NUNCA toma decisões financeiras ou inventa dados.
3. Você NUNCA inventa categorias. Use APENAS as categorias listadas no contexto.
4. Categoria é OPCIONAL. Se o gasto não se encaixa claramente em nenhuma categoria existente (ex: "Comprei um presente"), deixe o campo "category" nulo e registre o gasto assim mesmo. Nunca force uma categoria inadequada, e nunca deixe de registrar um gasto só porque a categoria é incerta.
5. Para a action "pay_fixed_expense", encontre o gasto fixo mais semelhante na lista de gastos fixos fornecida. Retorne o nome exato do gasto fixo no campo "expense_name".
6. Para perguntas do usuário ("question"), classifique a intenção em um dos seguintes tipos suportados no campo "intent":
   - "available_balance": Perguntas sobre o dinheiro disponível para gastar geral.
   - "category_remaining": Perguntas sobre quanto ainda resta em uma categoria específica.
   - "investment_total": Perguntas sobre quanto foi investido neste mês.
   - "fixed_expenses": Perguntas sobre gastos fixos (ex: o que falta pagar, lista de gastos).
   - "salary": Perguntas sobre o salário ou receitas registradas no mês.
   - "monthly_summary": Resumos gerais do mês (saldo, limites, etc).
   - "category_summary": Resumos/perguntas sobre gastos por categorias.

CONTEXTO REAL DO SISTEMA:
- Data atual: ${context.currentDate}
- Mês de referência: ${context.month}/${context.year}
- Saldo Bancário Atual: R$ ${context.bankBalance}
- Dinheiro Disponível para Gastar: R$ ${context.availableBalance}
- Total de Investimentos Efetivados neste mês: R$ ${context.investmentTotal}

CATEGORIAS CADASTRADAS:
${categoriesText || "(Nenhuma categoria cadastrada)"}

GASTOS FIXOS CADASTRADOS:
${fixedExpensesText || "(Nenhum gasto fixo cadastrado)"}
`;
}
