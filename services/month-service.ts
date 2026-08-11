import { computeMonthOpening, applyInvestmentGoalChange } from "@/lib/finance";
import { currentYearMonth, nextYearMonth, type YearMonth } from "@/lib/dates";
import type { Month } from "@/types/domain";
import { cardService } from "./card-service";
import { budgetRepository } from "./repositories/budget-repository";
import { categoryRepository } from "./repositories/category-repository";
import { fixedExpenseRepository } from "./repositories/fixed-expense-repository";
import { monthRepository } from "./repositories/month-repository";
import { recurringIncomeRepository } from "./repositories/recurring-income-repository";
import { vaultRepository } from "./repositories/vault-repository";

export interface OpenMonthInput {
  startingBalance: number;
  salary: number;
  extraIncome: number;
}

export const monthService = {
  /**
   * Mês financeiro corrente: o mês aberto mais recente.
   *
   * Não é o mês do calendário. Ao virar o mês manualmente, o app passa a
   * trabalhar sobre a nova competência mesmo que o calendário ainda não
   * tenha chegado lá — e um mês do calendário já fechado não reabre sozinho.
   */
  async getCurrentMonth(): Promise<Month | null> {
    return monthRepository.findLatestOpen();
  },

  /** Saldo bancário final do mês anterior — sugestão para a abertura. */
  async getPreviousMonthBalance(
    now: YearMonth = currentYearMonth()
  ): Promise<number | null> {
    const previous = await monthRepository.findLatestBefore(now.year, now.month);
    return previous?.bank_balance ?? null;
  },

  /**
   * Abre o mês corrente: calcula os saldos de abertura e cria os
   * orçamentos mensais copiando os limites padrão das categorias
   * (categories nunca é alterada).
   */
  async openMonth(
    input: OpenMonthInput,
    now: YearMonth = currentYearMonth()
  ): Promise<Month> {
    const [vault, activeFixed, categories] = await Promise.all([
      vaultRepository.find(),
      fixedExpenseRepository.listActive(),
      categoryRepository.list(),
    ]);
    if (!vault) throw new Error("Vault não encontrado.");

    const fixedExpensesTotal = activeFixed.reduce((sum, f) => sum + f.amount, 0);
    const balances = computeMonthOpening({
      startingBalance: input.startingBalance,
      salary: input.salary,
      extraIncome: input.extraIncome,
      fixedExpensesTotal,
      investmentGoal: vault.investment_goal,
    });

    const month = await monthRepository.create({
      year: now.year,
      month: now.month,
      starting_balance: input.startingBalance,
      salary: input.salary,
      extra_income: input.extraIncome,
      ...balances,
    });

    await budgetRepository.createMany(
      categories.map((category) => ({
        month_id: month.id,
        category_id: category.id,
        planned_limit: category.default_limit,
        current_limit: category.default_limit,
        spent: 0,
      }))
    );

    return month;
  },

  /**
   * Fecha o mês corrente e abre o seguinte.
   *
   * O mês fechado vira histórico: as faturas, parcelas e lançamentos dele
   * continuam consultáveis, mas os serviços recusam alterações. O saldo
   * bancário final entra como saldo inicial do novo mês, e o salário se
   * repete por ser recorrente — extras começam zerados, por serem eventuais.
   *
   * As faturas da nova competência nascem junto, com as parcelas que caem
   * nela e as assinaturas ativas.
   */
  async advanceMonth(input?: Partial<OpenMonthInput>): Promise<Month> {
    const current = await this.getCurrentMonth();
    if (!current) throw new Error("Nenhum mês aberto para fechar.");

    const next = nextYearMonth({ year: current.year, month: current.month });
    const existing = await monthRepository.findByYearMonth(next.year, next.month);
    if (existing) {
      throw new Error(
        `O mês ${next.month}/${next.year} já existe. Feche-o antes de avançar.`
      );
    }

    await monthRepository.update(current.id, { closed: true });

    const opened = await this.openMonth(
      {
        startingBalance: input?.startingBalance ?? Number(current.bank_balance),
        // O salário do novo mês vem das entradas fixas cadastradas, não do
        // valor congelado no mês anterior — se um salário mudou, vale o novo.
        salary: input?.salary ?? (await recurringIncomeRepository.activeTotal()),
        extraIncome: input?.extraIncome ?? 0,
      },
      next
    );

    // Traz para a nova competência as parcelas e assinaturas que caem nela.
    return cardService.refresh(opened);
  },

  /** Atualiza o valor reservado para investimento e o disponível do mês atual caso a meta mude. */
  async updateCurrentMonthInvestmentGoal(newGoal: number): Promise<void> {
    const current = await this.getCurrentMonth();
    if (!current || current.closed) return;

    const updatedBalances = applyInvestmentGoalChange(current, newGoal);

    await monthRepository.update(current.id, {
      reserved_investment: updatedBalances.reserved_investment,
      available_balance: updatedBalances.available_balance,
    });
  },
};

