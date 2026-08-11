import {
  adjustmentDelta,
  applyInvestmentGoalChange,
  computeAvailable,
  computeMonthOpening,
  round2,
} from "@/lib/finance";
import { currentYearMonth, nextYearMonth, type YearMonth } from "@/lib/dates";
import type { Month } from "@/types/domain";
import { cardService } from "./card-service";
import { adjustmentRepository } from "./repositories/adjustment-repository";
import { budgetRepository } from "./repositories/budget-repository";
import { cardInvoiceRepository } from "./repositories/card-invoice-repository";
import { categoryRepository } from "./repositories/category-repository";
import { fixedExpenseRepository } from "./repositories/fixed-expense-repository";
import { investmentRepository } from "./repositories/investment-repository";
import { monthRepository } from "./repositories/month-repository";
import { paymentRepository } from "./repositories/payment-repository";
import { recurringIncomeRepository } from "./repositories/recurring-income-repository";
import { transactionRepository } from "./repositories/transaction-repository";
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

  /**
   * Reconstrói saldo e reservas do mês a partir dos registros.
   *
   * Serve para consertar um mês que saiu de sincronia — cada operação
   * atualiza os saldos de forma incremental, então um erro no meio do caminho
   * fica congelado no total. Aqui nada é incremental: tudo é somado de novo a
   * partir do que está gravado.
   */
  async recalculate(month: Month): Promise<Month> {
    const [
      activeFixed,
      payments,
      invoices,
      transactions,
      adjustments,
      investments,
      vault,
    ] = await Promise.all([
      fixedExpenseRepository.listActive(),
      paymentRepository.listByMonth(month.id),
      cardInvoiceRepository.listByCompetence(month.year, month.month),
      transactionRepository.listByMonth(month.id),
      adjustmentRepository.listByMonth(month.id),
      investmentRepository.listByMonth(month.id),
      vaultRepository.find(),
    ]);

    /*
     * Saldo bancário: tudo que entrou menos tudo que saiu. Aportes não entram
     * — eles consomem a reserva de investimento, não o banco.
     */
    let bank =
      Number(month.starting_balance) +
      Number(month.salary) +
      Number(month.extra_income);

    bank -= payments.reduce((s, p) => s + Number(p.amount), 0);
    bank -= invoices
      .filter((i) => i.paid)
      .reduce((s, i) => s + Number(i.total), 0);

    for (const tx of transactions) {
      if (tx.type === "expense") bank -= Number(tx.amount);
      else if (tx.type === "income") bank += Number(tx.amount);
    }
    for (const adj of adjustments) {
      bank += adjustmentDelta(adj.type, Number(adj.amount));
    }
    bank = round2(bank);

    // Reservas: o que ainda não foi pago.
    const paidIds = new Set(payments.map((p) => p.fixed_expense_id));
    const reservedFixed = round2(
      activeFixed
        .filter((f) => !paidIds.has(f.id))
        .reduce((s, f) => s + Number(f.amount), 0)
    );
    const reservedInvoices = round2(
      invoices.filter((i) => !i.paid).reduce((s, i) => s + Number(i.total), 0)
    );
    const investedTotal = investments.reduce(
      (s, i) => s + Number(i.amount),
      0
    );
    const reservedInvestment = round2(
      Math.max(Number(vault?.investment_goal ?? 0), investedTotal)
    );

    return monthRepository.update(month.id, {
      bank_balance: bank,
      reserved_fixed_expenses: reservedFixed,
      reserved_investment: reservedInvestment,
      reserved_invoices: reservedInvoices,
      available_balance: computeAvailable(
        bank,
        reservedFixed,
        reservedInvestment,
        reservedInvoices
      ),
    });
  },

  /**
   * Zera os lançamentos do mês, mantendo o cadastro.
   *
   * Apaga transações, pagamentos, aportes e desmarca as faturas — tudo que
   * representa "já aconteceu". Depois recalcula, então saldo e reservas saem
   * coerentes com o estado limpo.
   *
   * Desmarcar as faturas é o que faltava na versão anterior: elas ficavam
   * pagas enquanto o saldo era recalculado como se nunca tivessem sido, e o
   * disponível passava a mostrar um dinheiro que já tinha saído.
   */
  async resetMonth(month: Month): Promise<Month> {
    if (month.closed) throw new Error("Este mês já está fechado.");

    const invoices = await cardInvoiceRepository.listByCompetence(
      month.year,
      month.month
    );

    await Promise.all([
      transactionRepository.removeByMonth(month.id),
      paymentRepository.removeByMonth(month.id),
      investmentRepository.removeByMonth(month.id),
      budgetRepository.resetSpentByMonth(month.id),
      ...invoices
        .filter((i) => i.paid)
        .map((i) =>
          cardInvoiceRepository.update(i.id, { paid: false, paid_at: null })
        ),
    ]);

    return this.recalculate(month);
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

