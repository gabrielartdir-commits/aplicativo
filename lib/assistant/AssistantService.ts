import { buildSystemPrompt, type AssistantPromptContext } from "./AssistantPrompt";
import { ASSISTANT_JSON_SCHEMA } from "./AssistantSchema";
import type {
  AssistantAction,
  AssistantPayload,
  AssistantParsedOutput,
  AssistantReplyData,
  AssistantServiceReply,
} from "./AssistantTypes";
import { monthRepository } from "@/services/repositories/month-repository";
import { budgetRepository } from "@/services/repositories/budget-repository";
import { fixedExpenseRepository } from "@/services/repositories/fixed-expense-repository";
import { paymentRepository } from "@/services/repositories/payment-repository";
import { investmentRepository } from "@/services/repositories/investment-repository";
import { transactionService } from "@/services/transaction-service";
import { fixedExpenseService } from "@/services/fixed-expense-service";
import { balanceService } from "@/services/balance-service";
import { aiConversationRepository } from "@/services/repositories/ai-conversation-repository";
import { formatCurrency } from "@/utils/format";
import { chatCompletion } from "@/lib/ai";
import type { Json } from "@/types/database";
import type { BudgetWithCategory, FixedExpense, Month } from "@/types/domain";

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function matchCategory(
  input: string | null | undefined,
  budgets: BudgetWithCategory[]
): BudgetWithCategory | null {
  if (!input) return null;
  const normInput = normalize(input);

  // 1. Exact match (normalized)
  let found = budgets.find((b) => normalize(b.category.name) === normInput);
  if (found) return found;

  // 2. Substring match (normalized)
  found = budgets.find(
    (b) =>
      normalize(b.category.name).includes(normInput) ||
      normInput.includes(normalize(b.category.name))
  );
  if (found) return found;

  // 3. Emoji match
  found = budgets.find(
    (b) =>
      b.category.emoji &&
      (normInput.includes(normalize(b.category.emoji)) ||
        normalize(b.category.emoji).includes(normInput))
  );
  return found || null;
}

function matchFixedExpense(
  input: string | null | undefined,
  expenses: FixedExpense[]
): FixedExpense | null {
  if (!input) return null;
  const normInput = normalize(input);

  // 1. Exact match (normalized)
  let found = expenses.find((f) => normalize(f.name) === normInput);
  if (found) return found;

  // 2. Substring match (normalized)
  found = expenses.find(
    (f) =>
      normalize(f.name).includes(normInput) ||
      normInput.includes(normalize(f.name))
  );
  return found || null;
}

export const AssistantService = {
  async processMessage(
    message: string,
    monthId: string | null
  ): Promise<AssistantServiceReply> {
    // 1. Obter o mês correspondente
    let month: Month | null = null;
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
      const errMsg = "Não encontrei nenhum mês financeiro aberto para processar a sua mensagem.";
      return {
        content: errMsg,
        actionExecuted: "unknown",
        payload: { reason: "no_active_month" },
      };
    }

    const currentMonthId = month.id;

    // 2. Coletar dados reais do banco para o contexto da IA
    const [budgets, activeFixedExpenses, payments, investments] = await Promise.all([
      budgetRepository.listByMonth(currentMonthId),
      fixedExpenseRepository.listActive(),
      paymentRepository.listByMonth(currentMonthId),
      investmentRepository.listByMonth(currentMonthId),
    ]);

    const investmentTotal = investments.reduce((sum, inv) => sum + Number(inv.amount), 0);
    const paidExpenseIds = new Set(payments.map((p) => p.fixed_expense_id));

    const promptContext: AssistantPromptContext = {
      year: month.year,
      month: month.month,
      bankBalance: Number(month.bank_balance),
      availableBalance: Number(month.available_balance),
      currentDate: new Date().toLocaleDateString("pt-BR"),
      investmentTotal,
      categories: budgets.map((b) => ({
        id: b.category_id,
        name: b.category.name,
        emoji: b.category.emoji,
        limit: Number(b.current_limit),
        spent: Number(b.spent),
        remaining: Number(b.remaining),
      })),
      fixedExpenses: activeFixedExpenses.map((f) => ({
        id: f.id,
        name: f.name,
        amount: Number(f.amount),
        paid: paidExpenseIds.has(f.id),
      })),
    };

    // 3. Chamar a IA com Structured Outputs
    const systemPrompt = buildSystemPrompt(promptContext);

    const parsedRaw = await chatCompletion({
      systemPrompt,
      userMessage: message,
      temperature: 0.1,
      jsonSchema: ASSISTANT_JSON_SCHEMA,
    });

    const aiOutput: AssistantParsedOutput = JSON.parse(parsedRaw);
    const { actions } = aiOutput;

    if (!actions || actions.length === 0) {
      return {
        content: "Desculpe, não identifiquei nenhuma ação para processar.",
        actionExecuted: "unknown",
        payload: { reason: "no_actions" },
      };
    }

    let content = "";
    let actionExecuted: AssistantAction = "unknown";
    let lastPayload: AssistantPayload = {};
    let extraData: AssistantReplyData | null = null;

    const executedDescriptions: string[] = [];
    const pendingActions: { action: AssistantAction; payload: AssistantPayload }[] = [];
    const localPaidExpenseIds = new Set(paidExpenseIds);

    // 4. Executar as intenções sequencialmente
    try {
      for (const item of actions) {
        const { action, payload } = item;

        // Atualizar o mês em memória buscando do banco a cada passo para garantir saldos corretos
        const currentMonth = await monthRepository.findByYearMonth(month.year, month.month);
        if (!currentMonth) {
          throw new Error("Mês não encontrado durante o processamento.");
        }
        month = currentMonth;

        try {
          if (action === "create_transaction") {
            const amount = payload.amount;
          if (!amount || amount <= 0) {
            throw new Error("Valor do gasto inválido.");
          }

          const matched = matchCategory(payload.category, budgets);
          if (!matched) {
            pendingActions.push(item);
          } else {
            await transactionService.registerExpense({
              month,
              amount,
              categoryId: matched.category_id,
              description: payload.description || message,
              date: payload.date || undefined,
              source: "ai",
            });
            executedDescriptions.push(
              `- ${matched.category.emoji} **${matched.category.name}**: ${formatCurrency(amount)} (${payload.description || "Gasto"})`
            );
            actionExecuted = "create_transaction";
            lastPayload = payload;
          }
        } else if (action === "create_income") {
          const amount = payload.amount;
          if (!amount || amount <= 0) {
            throw new Error("Valor da receita inválido.");
          }

          await transactionService.registerIncome({
            month,
            amount,
            description: payload.description || message,
            date: payload.date || undefined,
            source: "ai",
          });
          executedDescriptions.push(
            `- **Receita**: ${formatCurrency(amount)} (${payload.description || "Receita"})`
          );
          actionExecuted = "create_income";
          lastPayload = payload;
        } else if (action === "pay_fixed_expense") {
          const matched = matchFixedExpense(payload.expense_name, activeFixedExpenses);

          if (!matched) {
            pendingActions.push(item);
          } else {
            const isAlreadyPaid = localPaidExpenseIds.has(matched.id);
            if (isAlreadyPaid) {
              executedDescriptions.push(
                `- **Gasto Fixo** "${matched.name}" já está marcado como pago.`
              );
            } else {
              await fixedExpenseService.setPaid(month, matched, true);
              localPaidExpenseIds.add(matched.id);
              executedDescriptions.push(
                `- **Gasto Fixo** "${matched.name}" pago: ${formatCurrency(Number(matched.amount))}`
              );
              actionExecuted = "pay_fixed_expense";
              lastPayload = payload;
            }
          }
        } else if (action === "balance_adjustment") {
          const amount = payload.amount;
          const type = payload.type;
          if (!amount || !type) {
            throw new Error("Dados de ajuste de saldo inválidos.");
          }

          await balanceService.apply({
            month,
            type,
            amount,
            description: payload.description || message,
          });

          const typeLabels: Record<string, string> = {
            entry: "Entrada",
            exit: "Saída",
            correction: "Correção de Saldo",
            transfer: "Transferência",
          };
          executedDescriptions.push(
            `- **Ajuste de Saldo** (${typeLabels[type]}): ${formatCurrency(amount)}`
          );
          actionExecuted = "balance_adjustment";
          lastPayload = payload;
        } else if (action === "question") {
          const intent = payload.intent;
          let questionReply = "";
          if (intent === "available_balance") {
            questionReply = `Seu dinheiro disponível para gastar hoje é de ${formatCurrency(
              Number(month.available_balance)
            )}. (Saldo bancário: ${formatCurrency(
              Number(month.bank_balance)
            )} - Reservas fixas: ${formatCurrency(
              Number(month.reserved_fixed_expenses)
            )} - Meta de investimento: ${formatCurrency(
              Number(month.reserved_investment)
            )})`;
          } else if (intent === "category_remaining") {
            const matched = matchCategory(payload.category, budgets);
            if (matched) {
              questionReply = `Você ainda tem ${formatCurrency(
                Number(matched.remaining)
              )} disponíveis na categoria ${matched.category.emoji} ${
                matched.category.name
              } (Limite: ${formatCurrency(
                Number(matched.current_limit)
              )} | Gasto: ${formatCurrency(Number(matched.spent))})`;
            } else {
              const categoriesStatus = budgets
                .map(
                  (b) =>
                    `${b.category.emoji} ${b.category.name}: ${formatCurrency(
                      Number(b.remaining)
                    )} restantes`
                )
                .join("\n");
              questionReply = `Aqui está o saldo restante das suas categorias:\n${categoriesStatus}`;
            }
          } else if (intent === "investment_total") {
            questionReply = `Você aportou um total de ${formatCurrency(
              investmentTotal
            )} em investimentos este mês. A sua meta mensal definida é de ${formatCurrency(
              Number(month.reserved_investment)
            )}.`;
          } else if (intent === "fixed_expenses") {
            const unpaid = activeFixedExpenses.filter((f) => !localPaidExpenseIds.has(f.id));
            const totalUnpaid = unpaid.reduce((sum, f) => sum + Number(f.amount), 0);
            questionReply = `Você possui ${unpaid.length} gastos fixos pendentes de pagamento neste mês, totalizando ${formatCurrency(
              totalUnpaid
            )}.\n${unpaid
              .map((f) => `- ${f.name} (${formatCurrency(Number(f.amount))})`)
              .join("\n")}`;
          } else if (intent === "salary") {
            questionReply = `Seu salário cadastrado para este mês é de ${formatCurrency(
              Number(month.salary)
            )} (Receitas extras: ${formatCurrency(Number(month.extra_income))})`;
          } else if (intent === "monthly_summary") {
            questionReply = `Resumo Financeiro do Mês:\n- Saldo Bancário: ${formatCurrency(Number(month.bank_balance))}\n- Disponível para Gastar: ${formatCurrency(Number(month.available_balance))}\n- Reservado para Gastos Fixos: ${formatCurrency(Number(month.reserved_fixed_expenses))}\n- Meta de Investimento: ${formatCurrency(Number(month.reserved_investment))}\n- Aportes Realizados: ${formatCurrency(investmentTotal)}`;
          } else if (intent === "category_summary") {
            const summary = budgets
              .map(
                (b) =>
                  `- ${b.category.emoji} ${b.category.name}: Gasto ${formatCurrency(
                    Number(b.spent)
                  )} de ${formatCurrency(Number(b.current_limit))}`
              )
              .join("\n");
            questionReply = `Resumo de gastos por categoria:\n${summary}`;
          } else {
            questionReply = `Não entendi qual informação sobre o orçamento você deseja consultar. Você pode perguntar sobre "saldo disponível", "restante em alimentação", "investimentos" ou "gastos fixos".`;
          }
          executedDescriptions.push(questionReply);
          actionExecuted = "question";
          lastPayload = payload;
        } else if (action === "simulation") {
          executedDescriptions.push(
            `- **Simulação** de "${payload.description || "Gasto"}" de ${formatCurrency(payload.amount || 0)} na categoria "${payload.category || "Geral"}". (Simulações estarão disponíveis nas próximas versões)`
          );
          actionExecuted = "simulation";
          lastPayload = payload;
        } else {
          pendingActions.push(item);
        }
      } catch (err) {
        console.error("Erro ao processar ação sequencial:", err);
        const errMsg = err instanceof Error ? err.message : String(err);
        executedDescriptions.push(`- **Erro** ao registrar lançamento: ${payload.description || "Lançamento"} (${errMsg})`);
      }
    }
  } catch (e) {
    console.error(e);
      const message = e instanceof Error ? e.message : String(e);
      content = `Ocorreu um erro no loop de processamento do assistente: ${message}`;
      actionExecuted = "unknown";
    }

    // Refresh month state to show correct final available balance
    const finalMonth = await monthRepository.findByYearMonth(month.year, month.month);
    const finalAvailableBalance = finalMonth ? Number(finalMonth.available_balance) : Number(month.available_balance);

    // 5. Construir resposta em texto consolidada
    const contentParts: string[] = [];

    if (executedDescriptions.length > 0) {
      contentParts.push("**Lançamentos registrados com sucesso:**");
      contentParts.push(executedDescriptions.join("\n"));
    }

    if (pendingActions.length > 0) {
      contentParts.push("\n**Preciso de confirmação para o seguinte lançamento:**");
      const firstPending = pendingActions[0];
      contentParts.push(
        `- **Valor**: ${formatCurrency(firstPending.payload.amount || 0)} (${firstPending.payload.description || "Sem descrição"})`
      );
      contentParts.push("\nEscolha a categoria correspondente abaixo para concluir.");

      actionExecuted = "unknown";
      lastPayload = {
        ...firstPending.payload,
        reason: "category_not_identified",
      };
      extraData = {
        categories: budgets.map((b) => b.category),
        amount: firstPending.payload.amount || 0,
        description: firstPending.payload.description || message,
        date: firstPending.payload.date || new Date().toISOString().split("T")[0],
      };
    } else {
      if (executedDescriptions.length > 0) {
        contentParts.push(`\n**Novo Saldo Disponível**: ${formatCurrency(finalAvailableBalance)}`);
      }
    }

    content = contentParts.join("\n");

    // 6. Persistir conversa em ai_conversations
    await Promise.all([
      aiConversationRepository.append({
        month_id: currentMonthId,
        role: "user",
        content: message,
      }),
      aiConversationRepository.append({
        month_id: currentMonthId,
        role: "assistant",
        content,
        metadata: JSON.parse(
          JSON.stringify({ action: actionExecuted, payload: lastPayload, extraData })
        ) as Json,
      }),
    ]);

    return {
      content,
      actionExecuted,
      payload: lastPayload,
      data: extraData,
    };
  },
};
