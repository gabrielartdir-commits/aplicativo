/**
 * Regras financeiras do BudgetOS — funções puras, sem I/O.
 *
 * Conceito central (Modelo de Reserva Inteligente):
 *   Dinheiro Disponível = Saldo bancário
 *                       - Gastos fixos reservados
 *                       - Reserva de investimento
 *                       - Faturas de cartão em aberto
 *
 * A meta de investimento é subtraída do disponível na abertura do mês.
 * Aportes dentro da meta reduzem a reserva e o banco (disponível não muda).
 * Aportes que excedem a reserva (ou aportes quando a meta é zero/pausada) saem do disponível.
 *
 * Crédito: a fatura em aberto é reservada assim que conhecida, como um gasto
 * fixo. Assinaturas no crédito compõem a fatura e NÃO reservam por fora —
 * contá-las duas vezes dobraria o mesmo compromisso.
 */
import type { AdjustmentType } from "@/types/database";
import type { Month } from "@/types/domain";

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface MonthBalances {
  bank_balance: number;
  reserved_fixed_expenses: number;
  reserved_investment: number;
  reserved_invoices: number;
  available_balance: number;
}

export function computeAvailable(
  bankBalance: number,
  reservedFixedExpenses: number,
  reservedInvestment: number,
  reservedInvoices: number = 0
): number {
  return round2(
    bankBalance - reservedFixedExpenses - reservedInvestment - reservedInvoices
  );
}

export interface MonthOpeningInput {
  startingBalance: number;
  salary: number;
  extraIncome: number;
  fixedExpensesTotal: number;
  investmentGoal: number;
  invoicesTotal?: number;
}

/** Números de abertura de um novo mês financeiro. */
export function computeMonthOpening(input: MonthOpeningInput): MonthBalances {
  const bankBalance = round2(
    input.startingBalance + input.salary + input.extraIncome
  );
  const reservedInvestment = round2(input.investmentGoal);
  const reservedInvoices = round2(input.invoicesTotal ?? 0);
  return {
    bank_balance: bankBalance,
    reserved_fixed_expenses: round2(input.fixedExpensesTotal),
    reserved_investment: reservedInvestment,
    reserved_invoices: reservedInvoices,
    available_balance: computeAvailable(
      bankBalance,
      input.fixedExpensesTotal,
      reservedInvestment,
      reservedInvoices
    ),
  };
}

function rebalance(
  month: Pick<Month, keyof MonthBalances>,
  delta: Partial<MonthBalances>
): MonthBalances {
  const bank_balance = round2(month.bank_balance + (delta.bank_balance ?? 0));
  const reserved_fixed_expenses = round2(
    month.reserved_fixed_expenses + (delta.reserved_fixed_expenses ?? 0)
  );
  const reserved_investment = round2(
    month.reserved_investment + (delta.reserved_investment ?? 0)
  );
  const reserved_invoices = round2(
    month.reserved_invoices + (delta.reserved_invoices ?? 0)
  );
  return {
    bank_balance,
    reserved_fixed_expenses,
    reserved_investment,
    reserved_invoices,
    available_balance: computeAvailable(
      bank_balance,
      reserved_fixed_expenses,
      reserved_investment,
      reserved_invoices
    ),
  };
}

/** Gasto variável: sai do banco e, portanto, do disponível. */
export function applyExpense(
  month: Pick<Month, keyof MonthBalances>,
  amount: number
): MonthBalances {
  return rebalance(month, { bank_balance: -amount });
}

/** Receita: entra no banco e aumenta o disponível. */
export function applyIncome(
  month: Pick<Month, keyof MonthBalances>,
  amount: number
): MonthBalances {
  return rebalance(month, { bank_balance: amount });
}

/**
 * Pagamento de gasto fixo: sai do banco E da reserva ao mesmo tempo —
 * o disponível NÃO muda, pois esse dinheiro já estava reservado.
 * `paid = false` desfaz o pagamento.
 */
export function applyFixedExpensePayment(
  month: Pick<Month, keyof MonthBalances>,
  amount: number,
  paid: boolean
): MonthBalances {
  const signed = paid ? -amount : amount;
  return rebalance(month, {
    bank_balance: signed,
    reserved_fixed_expenses: signed,
  });
}

/**
 * Pagamento da fatura do cartão: mesma mecânica do gasto fixo — sai do banco
 * e da reserva de faturas ao mesmo tempo, então o disponível não muda.
 * `paid = false` desfaz o pagamento.
 */
export function applyInvoicePayment(
  month: Pick<Month, keyof MonthBalances>,
  amount: number,
  paid: boolean
): MonthBalances {
  const signed = paid ? -amount : amount;
  return rebalance(month, {
    bank_balance: signed,
    reserved_invoices: signed,
  });
}

/**
 * Sincroniza a reserva de faturas com o total em aberto do mês.
 * Usada quando parcelas ou assinaturas mudam e a fatura é recalculada.
 */
export function applyInvoicesTotalChange(
  month: Pick<Month, keyof MonthBalances>,
  openInvoicesTotal: number
): MonthBalances {
  const reserved_invoices = round2(openInvoicesTotal);
  return {
    bank_balance: month.bank_balance,
    reserved_fixed_expenses: month.reserved_fixed_expenses,
    reserved_investment: month.reserved_investment,
    reserved_invoices,
    available_balance: computeAvailable(
      month.bank_balance,
      month.reserved_fixed_expenses,
      month.reserved_investment,
      reserved_invoices
    ),
  };
}

/**
 * Aporte de investimento efetivado: reduz o banco.
 * A reserva de investimento é reduzida somente até 0 (não fica negativa).
 * Se o aporte exceder a reserva (investimento manual/extra), o excesso reduz o disponível.
 */
export function applyInvestment(
  month: Pick<Month, keyof MonthBalances>,
  amount: number
): MonthBalances {
  const newReserved = Math.max(month.reserved_investment, amount);
  return {
    bank_balance: month.bank_balance,
    reserved_fixed_expenses: month.reserved_fixed_expenses,
    reserved_investment: newReserved,
    reserved_invoices: month.reserved_invoices,
    available_balance: computeAvailable(
      month.bank_balance,
      month.reserved_fixed_expenses,
      newReserved,
      month.reserved_invoices
    ),
  };
}

/** Sinal do efeito de um ajuste de saldo sobre o banco. */
export function adjustmentDelta(type: AdjustmentType, amount: number): number {
  switch (type) {
    case "entry":
      return Math.abs(amount);
    case "exit":
    case "transfer":
      return -Math.abs(amount);
    case "correction":
      return amount;
  }
}

/**
 * Ajuste de saldo: altera APENAS o saldo bancário (nunca categorias)
 * e recalcula o disponível.
 */
export function applyAdjustment(
  month: Pick<Month, keyof MonthBalances>,
  type: AdjustmentType,
  amount: number
): MonthBalances {
  return rebalance(month, { bank_balance: adjustmentDelta(type, amount) });
}

/**
 * Alteração da meta de investimento: atualiza a reserva e o disponível do mês atual.
 */
export function applyInvestmentGoalChange(
  month: Pick<Month, keyof MonthBalances>,
  newGoal: number
): MonthBalances {
  const reserved_investment = round2(newGoal);
  return {
    bank_balance: month.bank_balance,
    reserved_fixed_expenses: month.reserved_fixed_expenses,
    reserved_investment,
    reserved_invoices: month.reserved_invoices,
    available_balance: computeAvailable(
      month.bank_balance,
      month.reserved_fixed_expenses,
      reserved_investment,
      month.reserved_invoices
    ),
  };
}

/**
 * Divide o total de uma compra em N parcelas de centavos exatos.
 * O resíduo do arredondamento vai na última parcela, para que a soma das
 * partes seja sempre igual ao total — nunca um centavo a mais ou a menos.
 */
export function splitInstallments(total: number, count: number): number[] {
  if (count < 1) throw new Error("A compra precisa de ao menos uma parcela.");
  const base = Math.floor((total * 100) / count) / 100;
  const parts = Array.from({ length: count }, () => base);
  const distributed = round2(base * count);
  parts[count - 1] = round2(base + (round2(total) - distributed));
  return parts;
}

/**
 * Competência (ano/mês) de cada parcela a partir da primeira cobrança.
 * A parcela 1 cai no mês informado; as seguintes avançam um mês por vez.
 */
export function installmentCompetences(
  firstYear: number,
  firstMonth: number,
  count: number
): { year: number; month: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const zeroBased = firstMonth - 1 + i;
    return {
      year: firstYear + Math.floor(zeroBased / 12),
      month: (zeroBased % 12) + 1,
    };
  });
}
