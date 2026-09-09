"use server";

import { all, buildUpdate, get, newId, run } from "@/lib/db";
import type { Database } from "@/types/database";
import type {
  FixedExpense,
  FixedExpensePayment,
  RecurringIncome,
} from "@/types/domain";

type FixedExpenseInsert =
  Database["public"]["Tables"]["fixed_expenses"]["Insert"];
type FixedExpenseUpdate =
  Database["public"]["Tables"]["fixed_expenses"]["Update"];
type RecurringIncomeInsert =
  Database["public"]["Tables"]["recurring_incomes"]["Insert"];
type RecurringIncomeUpdate =
  Database["public"]["Tables"]["recurring_incomes"]["Update"];

/** SQLite guarda booleano como 0/1; o domínio espera boolean. */
function withActive<T>(row: Record<string, unknown>): T {
  return { ...row, active: Boolean(row.active) } as T;
}

// ----------------------------------------------------- fixed expenses

export async function listFixedExpenses(): Promise<FixedExpense[]> {
  return all("SELECT * FROM fixed_expenses ORDER BY due_day, created_at").map(
    (row) => withActive<FixedExpense>(row)
  );
}

export async function listActiveFixedExpenses(): Promise<FixedExpense[]> {
  return all(
    "SELECT * FROM fixed_expenses WHERE active = 1 ORDER BY due_day"
  ).map((row) => withActive<FixedExpense>(row));
}

async function findFixedExpense(id: string): Promise<FixedExpense | null> {
  const row = get<Record<string, unknown>>(
    "SELECT * FROM fixed_expenses WHERE id = :id",
    { id }
  );
  return row ? withActive<FixedExpense>(row) : null;
}

export async function createFixedExpense(
  input: FixedExpenseInsert
): Promise<FixedExpense> {
  const id = input.id ?? newId();
  run(
    `INSERT INTO fixed_expenses (id, name, amount, due_day, active)
     VALUES (:id, :name, :amount, :due_day, :active)`,
    {
      id,
      name: input.name,
      amount: input.amount,
      due_day: input.due_day,
      active: input.active ?? true,
    }
  );
  return (await findFixedExpense(id))!;
}

export async function updateFixedExpense(
  id: string,
  patch: FixedExpenseUpdate
): Promise<FixedExpense> {
  const update = buildUpdate(patch, ["name", "amount", "due_day", "active"]);
  if (update) {
    run(`UPDATE fixed_expenses SET ${update.clause} WHERE id = :id`, {
      ...update.params,
      id,
    });
  }
  return (await findFixedExpense(id))!;
}

export async function removeFixedExpense(id: string): Promise<void> {
  run("DELETE FROM fixed_expenses WHERE id = :id", { id });
}

// ----------------------------------------------------------- payments

export async function listPaymentsByMonth(
  monthId: string
): Promise<FixedExpensePayment[]> {
  return all<FixedExpensePayment>(
    "SELECT * FROM fixed_expense_payments WHERE month_id = :monthId",
    { monthId }
  );
}

export async function createPayment(input: {
  month_id: string;
  fixed_expense_id: string;
  amount: number;
}): Promise<FixedExpensePayment> {
  const id = newId();
  run(
    `INSERT INTO fixed_expense_payments (id, month_id, fixed_expense_id, amount)
     VALUES (:id, :month_id, :fixed_expense_id, :amount)`,
    {
      id,
      month_id: input.month_id,
      fixed_expense_id: input.fixed_expense_id,
      amount: input.amount,
    }
  );
  return get<FixedExpensePayment>(
    "SELECT * FROM fixed_expense_payments WHERE id = :id",
    { id }
  )!;
}

export async function removePayment(
  monthId: string,
  fixedExpenseId: string
): Promise<void> {
  run(
    `DELETE FROM fixed_expense_payments
     WHERE month_id = :monthId AND fixed_expense_id = :fixedExpenseId`,
    { monthId, fixedExpenseId }
  );
}

export async function removePaymentsByMonth(monthId: string): Promise<void> {
  run("DELETE FROM fixed_expense_payments WHERE month_id = :monthId", {
    monthId,
  });
}

// -------------------------------------------------- recurring incomes

export async function listRecurringIncomes(): Promise<RecurringIncome[]> {
  return all(
    "SELECT * FROM recurring_incomes ORDER BY sort_order, created_at"
  ).map((row) => withActive<RecurringIncome>(row));
}

export async function findRecurringIncomeById(
  id: string
): Promise<RecurringIncome | null> {
  const row = get<Record<string, unknown>>(
    "SELECT * FROM recurring_incomes WHERE id = :id",
    { id }
  );
  return row ? withActive<RecurringIncome>(row) : null;
}

export async function recurringIncomeActiveTotal(): Promise<number> {
  const row = get<{ total: number | null }>(
    "SELECT SUM(amount) AS total FROM recurring_incomes WHERE active = 1"
  );
  return Number(row?.total ?? 0);
}

export async function createRecurringIncome(
  input: RecurringIncomeInsert
): Promise<RecurringIncome> {
  const id = input.id ?? newId();
  run(
    `INSERT INTO recurring_incomes (id, name, amount, active, sort_order)
     VALUES (:id, :name, :amount, :active, :sort_order)`,
    {
      id,
      name: input.name,
      amount: input.amount ?? 0,
      active: input.active ?? true,
      sort_order: input.sort_order ?? 0,
    }
  );
  return (await findRecurringIncomeById(id))!;
}

export async function updateRecurringIncome(
  id: string,
  patch: RecurringIncomeUpdate
): Promise<RecurringIncome> {
  const update = buildUpdate(patch, [
    "name",
    "amount",
    "active",
    "sort_order",
  ]);
  if (update) {
    run(`UPDATE recurring_incomes SET ${update.clause} WHERE id = :id`, {
      ...update.params,
      id,
    });
  }
  return (await findRecurringIncomeById(id))!;
}

export async function removeRecurringIncome(id: string): Promise<void> {
  run("DELETE FROM recurring_incomes WHERE id = :id", { id });
}
