"use server";

import { all, buildUpdate, get, newId, run } from "@/lib/db";
import type { Database } from "@/types/database";
import type {
  BudgetWithCategory,
  Category,
  Month,
  MonthlyCategoryBudget,
  Vault,
} from "@/types/domain";

type MonthInsert = Database["public"]["Tables"]["months"]["Insert"];
type MonthUpdate = Database["public"]["Tables"]["months"]["Update"];
type CategoryInsert = Database["public"]["Tables"]["categories"]["Insert"];
type CategoryUpdate = Database["public"]["Tables"]["categories"]["Update"];
type BudgetInsert =
  Database["public"]["Tables"]["monthly_category_budgets"]["Insert"];

/** SQLite guarda booleano como 0/1; o domínio espera boolean. */
function toMonth(row: Record<string, unknown> | null): Month | null {
  if (!row) return null;
  return { ...row, closed: Boolean(row.closed) } as Month;
}

const MONTH_ORDER = "ORDER BY year DESC, month DESC";

// ---------------------------------------------------------------- vault

export async function findVault(): Promise<Vault | null> {
  return get<Vault>("SELECT * FROM vault LIMIT 1");
}

export async function createVault(input: {
  name: string;
  investment_goal?: number;
}): Promise<Vault> {
  const id = newId();
  run(
    `INSERT INTO vault (id, name, investment_goal)
     VALUES (:id, :name, :investment_goal)`,
    { id, name: input.name, investment_goal: input.investment_goal ?? 0 }
  );
  return get<Vault>("SELECT * FROM vault WHERE id = :id", { id })!;
}

export async function updateVaultInvestmentGoal(
  id: string,
  investmentGoal: number
): Promise<void> {
  run("UPDATE vault SET investment_goal = :goal WHERE id = :id", {
    id,
    goal: investmentGoal,
  });
}

// ---------------------------------------------------------------- months

export async function findMonthByYearMonth(
  year: number,
  month: number
): Promise<Month | null> {
  return toMonth(
    get("SELECT * FROM months WHERE year = :year AND month = :month", {
      year,
      month,
    })
  );
}

export async function findMonthById(id: string): Promise<Month | null> {
  return toMonth(get("SELECT * FROM months WHERE id = :id", { id }));
}

export async function findLatestOpenMonth(): Promise<Month | null> {
  return toMonth(
    get(`SELECT * FROM months WHERE closed = 0 ${MONTH_ORDER} LIMIT 1`)
  );
}

export async function findLatestMonth(): Promise<Month | null> {
  return toMonth(get(`SELECT * FROM months ${MONTH_ORDER} LIMIT 1`));
}

export async function findLatestMonthBefore(
  year: number,
  month: number
): Promise<Month | null> {
  return toMonth(
    get(
      `SELECT * FROM months
       WHERE year < :year OR (year = :year AND month < :month)
       ${MONTH_ORDER} LIMIT 1`,
      { year, month }
    )
  );
}

export async function listMonths(): Promise<Month[]> {
  return all(`SELECT * FROM months ${MONTH_ORDER}`).map(
    (row) => toMonth(row)!
  );
}

export async function createMonth(input: MonthInsert): Promise<Month> {
  const id = input.id ?? newId();
  run(
    `INSERT INTO months (
       id, year, month, starting_balance, salary, extra_income, bank_balance,
       reserved_fixed_expenses, reserved_investment, reserved_invoices,
       available_balance, closed
     ) VALUES (
       :id, :year, :month, :starting_balance, :salary, :extra_income,
       :bank_balance, :reserved_fixed_expenses, :reserved_investment,
       :reserved_invoices, :available_balance, :closed
     )`,
    {
      id,
      year: input.year,
      month: input.month,
      starting_balance: input.starting_balance ?? 0,
      salary: input.salary ?? 0,
      extra_income: input.extra_income ?? 0,
      bank_balance: input.bank_balance ?? 0,
      reserved_fixed_expenses: input.reserved_fixed_expenses ?? 0,
      reserved_investment: input.reserved_investment ?? 0,
      reserved_invoices: input.reserved_invoices ?? 0,
      available_balance: input.available_balance ?? 0,
      closed: input.closed ?? false,
    }
  );
  return (await findMonthById(id))!;
}

const MONTH_FIELDS = [
  "year",
  "month",
  "starting_balance",
  "salary",
  "extra_income",
  "bank_balance",
  "reserved_fixed_expenses",
  "reserved_investment",
  "reserved_invoices",
  "available_balance",
  "closed",
] as const;

export async function updateMonth(
  id: string,
  patch: MonthUpdate
): Promise<Month> {
  const update = buildUpdate(patch, MONTH_FIELDS);
  if (update) {
    run(`UPDATE months SET ${update.clause} WHERE id = :id`, {
      ...update.params,
      id,
    });
  }
  return (await findMonthById(id))!;
}

// ------------------------------------------------------------ categories

export async function listCategories(): Promise<Category[]> {
  return all<Category>(
    "SELECT * FROM categories ORDER BY sort_order, created_at"
  );
}

export async function createCategory(
  input: CategoryInsert
): Promise<Category> {
  const id = input.id ?? newId();
  run(
    `INSERT INTO categories (id, emoji, name, default_limit, color, sort_order)
     VALUES (:id, :emoji, :name, :default_limit, :color, :sort_order)`,
    {
      id,
      emoji: input.emoji ?? "",
      name: input.name,
      default_limit: input.default_limit ?? 0,
      color: input.color ?? null,
      sort_order: input.sort_order ?? 0,
    }
  );
  return get<Category>("SELECT * FROM categories WHERE id = :id", { id })!;
}

export async function updateCategory(
  id: string,
  patch: CategoryUpdate
): Promise<Category> {
  const update = buildUpdate(patch, [
    "emoji",
    "name",
    "default_limit",
    "color",
    "sort_order",
  ]);
  if (update) {
    run(`UPDATE categories SET ${update.clause} WHERE id = :id`, {
      ...update.params,
      id,
    });
  }
  return get<Category>("SELECT * FROM categories WHERE id = :id", { id })!;
}

export async function removeCategory(id: string): Promise<void> {
  run("DELETE FROM categories WHERE id = :id", { id });
}

// --------------------------------------------------------------- budgets

/**
 * O join com categorias é montado aqui em vez de num SELECT com alias:
 * duas consultas simples são mais legíveis que desempacotar colunas
 * prefixadas, e o volume por mês é de dezenas de linhas.
 */
export async function listBudgetsByMonth(
  monthId: string
): Promise<BudgetWithCategory[]> {
  const budgets = all<MonthlyCategoryBudget>(
    "SELECT * FROM monthly_category_budgets WHERE month_id = :monthId",
    { monthId }
  );
  const categories = await listCategories();
  const byId = new Map(categories.map((c) => [c.id, c]));

  return budgets
    .map((budget) => ({
      ...budget,
      category: byId.get(budget.category_id)!,
    }))
    .filter((budget) => budget.category)
    .sort((a, b) => a.category.sort_order - b.category.sort_order);
}

export async function findBudgetByMonthAndCategory(
  monthId: string,
  categoryId: string
): Promise<MonthlyCategoryBudget | null> {
  return get<MonthlyCategoryBudget>(
    `SELECT * FROM monthly_category_budgets
     WHERE month_id = :monthId AND category_id = :categoryId`,
    { monthId, categoryId }
  );
}

export async function createBudgets(inputs: BudgetInsert[]): Promise<void> {
  for (const input of inputs) {
    run(
      `INSERT INTO monthly_category_budgets
         (id, month_id, category_id, planned_limit, current_limit, spent)
       VALUES (:id, :month_id, :category_id, :planned_limit, :current_limit, :spent)`,
      {
        id: input.id ?? newId(),
        month_id: input.month_id,
        category_id: input.category_id,
        planned_limit: input.planned_limit ?? 0,
        current_limit: input.current_limit ?? 0,
        spent: input.spent ?? 0,
      }
    );
  }
}

export async function updateBudgetSpent(
  id: string,
  spent: number
): Promise<void> {
  run("UPDATE monthly_category_budgets SET spent = :spent WHERE id = :id", {
    id,
    spent,
  });
}

export async function resetBudgetSpentByMonth(monthId: string): Promise<void> {
  run(
    "UPDATE monthly_category_budgets SET spent = 0 WHERE month_id = :monthId",
    { monthId }
  );
}

export async function updateBudgetCurrentLimit(
  id: string,
  currentLimit: number
): Promise<void> {
  run(
    "UPDATE monthly_category_budgets SET current_limit = :limit WHERE id = :id",
    { id, limit: currentLimit }
  );
}

/**
 * Alinha o orçamento do mês ao novo limite padrão da categoria.
 * Muda planejado e vigente juntos: editar a categoria é redefinir o plano.
 */
export async function updateBudgetLimits(
  id: string,
  limit: number
): Promise<void> {
  run(
    `UPDATE monthly_category_budgets
     SET planned_limit = :limit, current_limit = :limit
     WHERE id = :id`,
    { id, limit }
  );
}
