import { applyFixedExpensePayment, round2, computeAvailable } from "@/lib/finance";
import type { FixedExpense, Month } from "@/types/domain";
import { monthRepository } from "./repositories/month-repository";
import { paymentRepository } from "./repositories/payment-repository";
import { fixedExpenseRepository } from "./repositories/fixed-expense-repository";
import type { Database } from "@/types/database";

type FixedExpenseInsert =
  Database["public"]["Tables"]["fixed_expenses"]["Insert"];
type FixedExpenseUpdate =
  Database["public"]["Tables"]["fixed_expenses"]["Update"];

async function syncMonthReservedFixedExpenses(monthId: string): Promise<void> {
  const month = await monthRepository.findById(monthId);
  if (!month) return;

  const expenses = await fixedExpenseRepository.list();
  const payments = await paymentRepository.listByMonth(monthId);
  const paidIds = new Set(payments.map((p) => p.fixed_expense_id));

  // Soma de todas as despesas fixas ativas e ainda não pagas neste mês
  const unpaidTotal = expenses
    .filter((e) => e.active && !paidIds.has(e.id))
    .reduce((sum, e) => sum + e.amount, 0);

  const roundedUnpaid = round2(unpaidTotal);
  await monthRepository.update(monthId, {
    reserved_fixed_expenses: roundedUnpaid,
    available_balance: computeAvailable(
      month.bank_balance,
      roundedUnpaid,
      month.reserved_investment,
      month.reserved_invoices
    ),
  });
}

export const fixedExpenseService = {
  /**
   * Marca/desmarca um gasto fixo como pago no mês.
   * O pagamento sai do saldo bancário E da reserva de gastos fixos —
   * o Dinheiro Disponível não muda (já estava reservado).
   * Recalcula a reserva baseando-se no estado real do banco de dados para evitar descompassos.
   */
  async setPaid(
    month: Month,
    expense: FixedExpense,
    paid: boolean
  ): Promise<void> {
    if (month.closed) throw new Error("Este mês já está fechado.");

    if (paid) {
      await paymentRepository.create({
        month_id: month.id,
        fixed_expense_id: expense.id,
        amount: expense.amount,
      });
    } else {
      await paymentRepository.remove(month.id, expense.id);
    }

    const signed = paid ? -expense.amount : expense.amount;
    const newBankBalance = round2(month.bank_balance + signed);

    const expenses = await fixedExpenseRepository.list();
    const payments = await paymentRepository.listByMonth(month.id);
    const paidIds = new Set(payments.map((p) => p.fixed_expense_id));

    const unpaidTotal = expenses
      .filter((e) => e.active && !paidIds.has(e.id))
      .reduce((sum, e) => sum + e.amount, 0);

    const roundedUnpaid = round2(unpaidTotal);

    await monthRepository.update(month.id, {
      bank_balance: newBankBalance,
      reserved_fixed_expenses: roundedUnpaid,
      available_balance: computeAvailable(
        newBankBalance,
        roundedUnpaid,
        month.reserved_investment,
        month.reserved_invoices
      ),
    });
  },

  async create(input: FixedExpenseInsert, currentMonthId: string | null): Promise<FixedExpense> {
    const expense = await fixedExpenseRepository.create(input);
    if (currentMonthId) {
      await syncMonthReservedFixedExpenses(currentMonthId);
    }
    return expense;
  },

  async update(
    id: string,
    patch: FixedExpenseUpdate,
    currentMonthId: string | null
  ): Promise<FixedExpense> {
    const expense = await fixedExpenseRepository.update(id, patch);
    if (currentMonthId) {
      await syncMonthReservedFixedExpenses(currentMonthId);
    }
    return expense;
  },

  async remove(id: string, currentMonthId: string | null): Promise<void> {
    await fixedExpenseRepository.remove(id);
    if (currentMonthId) {
      await syncMonthReservedFixedExpenses(currentMonthId);
    }
  },
};
