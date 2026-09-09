"use server";

import { all, buildUpdate, get, newId, run } from "@/lib/db";
import type { Database, Json } from "@/types/database";
import type {
  AiConversationEntry,
  BalanceAdjustment,
  Category,
  Investment,
  Transaction,
  TransactionWithCategory,
} from "@/types/domain";
import { listCategories } from "./core.actions";

type TransactionInsert = Database["public"]["Tables"]["transactions"]["Insert"];
type TransactionUpdate = Database["public"]["Tables"]["transactions"]["Update"];
type AdjustmentInsert =
  Database["public"]["Tables"]["balance_adjustments"]["Insert"];

export interface TransactionFilters {
  categoryId?: string;
  search?: string;
  from?: string;
  to?: string;
  ascending?: boolean;
}

// --------------------------------------------------------- transactions

export async function listTransactionsByMonth(
  monthId: string,
  filters: TransactionFilters = {}
): Promise<TransactionWithCategory[]> {
  const where = ["month_id = :monthId"];
  const params: Record<string, unknown> = { monthId };

  if (filters.categoryId) {
    where.push("category_id = :categoryId");
    params.categoryId = filters.categoryId;
  }
  if (filters.search) {
    // LIKE no SQLite já é insensível a maiúsculas para ASCII.
    where.push("description LIKE :search");
    params.search = `%${filters.search}%`;
  }
  if (filters.from) {
    where.push("date >= :from");
    params.from = filters.from;
  }
  if (filters.to) {
    where.push("date <= :to");
    params.to = filters.to;
  }

  const dir = filters.ascending ? "ASC" : "DESC";
  const rows = all<Transaction>(
    `SELECT * FROM transactions WHERE ${where.join(" AND ")}
     ORDER BY date ${dir}, created_at ${dir}`,
    params
  );

  const byId = new Map((await listCategories()).map((c: Category) => [c.id, c]));
  return rows.map((tx) => ({
    ...tx,
    category: tx.category_id ? (byId.get(tx.category_id) ?? null) : null,
  }));
}

/**
 * Gastos variáveis por mês, para a média usada nas projeções.
 * Só `expense`: receitas, ajustes e aportes não são consumo do dia a dia.
 */
export async function variableSpendByMonth(): Promise<
  { month_id: string; total: number }[]
> {
  return all<{ month_id: string; total: number }>(
    `SELECT month_id, SUM(amount) AS total FROM transactions
     WHERE type = 'expense' GROUP BY month_id`
  );
}

export async function createTransaction(
  input: TransactionInsert
): Promise<Transaction> {
  const id = input.id ?? newId();
  run(
    `INSERT INTO transactions
       (id, month_id, category_id, type, amount, description, source, date)
     VALUES
       (:id, :month_id, :category_id, :type, :amount, :description, :source,
        COALESCE(:date, date('now')))`,
    {
      id,
      month_id: input.month_id,
      category_id: input.category_id ?? null,
      type: input.type,
      amount: input.amount,
      description: input.description ?? null,
      source: input.source ?? "manual",
      date: input.date ?? null,
    }
  );
  return (await findTransactionById(id))!;
}

export async function findTransactionById(
  id: string
): Promise<Transaction | null> {
  return get<Transaction>("SELECT * FROM transactions WHERE id = :id", { id });
}

export async function updateTransaction(
  id: string,
  patch: TransactionUpdate
): Promise<Transaction> {
  const update = buildUpdate(patch, [
    "month_id",
    "category_id",
    "type",
    "amount",
    "description",
    "source",
    "date",
  ]);
  if (update) {
    run(`UPDATE transactions SET ${update.clause} WHERE id = :id`, {
      ...update.params,
      id,
    });
  }
  return (await findTransactionById(id))!;
}

export async function removeTransaction(id: string): Promise<void> {
  run("DELETE FROM transactions WHERE id = :id", { id });
}

export async function removeTransactionsByMonth(
  monthId: string
): Promise<void> {
  run("DELETE FROM transactions WHERE month_id = :monthId", { monthId });
}

// --------------------------------------------------------- adjustments

export async function listAdjustmentsByMonth(
  monthId: string
): Promise<BalanceAdjustment[]> {
  return all<BalanceAdjustment>(
    `SELECT * FROM balance_adjustments WHERE month_id = :monthId
     ORDER BY created_at DESC`,
    { monthId }
  );
}

export async function createAdjustment(
  input: AdjustmentInsert
): Promise<BalanceAdjustment> {
  const id = input.id ?? newId();
  run(
    `INSERT INTO balance_adjustments (id, month_id, type, amount, description)
     VALUES (:id, :month_id, :type, :amount, :description)`,
    {
      id,
      month_id: input.month_id,
      type: input.type,
      amount: input.amount,
      description: input.description ?? null,
    }
  );
  return get<BalanceAdjustment>(
    "SELECT * FROM balance_adjustments WHERE id = :id",
    { id }
  )!;
}

export async function removeAdjustment(id: string): Promise<void> {
  run("DELETE FROM balance_adjustments WHERE id = :id", { id });
}

// --------------------------------------------------------- investments

export async function listInvestmentsByMonth(
  monthId: string
): Promise<Investment[]> {
  return all<Investment>(
    "SELECT * FROM investments WHERE month_id = :monthId",
    { monthId }
  );
}

export async function listAllInvestments(): Promise<Investment[]> {
  return all<Investment>("SELECT * FROM investments");
}

export async function createInvestment(input: {
  month_id: string;
  amount: number;
  description?: string | null;
}): Promise<Investment> {
  const id = newId();
  run(
    `INSERT INTO investments (id, month_id, amount, description)
     VALUES (:id, :month_id, :amount, :description)`,
    {
      id,
      month_id: input.month_id,
      amount: input.amount,
      description: input.description ?? null,
    }
  );
  return get<Investment>("SELECT * FROM investments WHERE id = :id", { id })!;
}

export async function removeInvestmentByMonthAmountDescription(
  monthId: string,
  amount: number,
  description: string
): Promise<void> {
  run(
    `DELETE FROM investments
     WHERE month_id = :monthId AND amount = :amount
       AND COALESCE(description, '') = :description`,
    { monthId, amount, description }
  );
}

export async function removeInvestmentsByMonth(
  monthId: string
): Promise<void> {
  run("DELETE FROM investments WHERE month_id = :monthId", { monthId });
}

// ----------------------------------------------------- ai conversations

export async function appendAiConversation(input: {
  month_id: string | null;
  role: "user" | "assistant";
  content: string;
  metadata?: Json;
}): Promise<AiConversationEntry> {
  const id = newId();
  run(
    `INSERT INTO ai_conversations (id, month_id, role, content, metadata)
     VALUES (:id, :month_id, :role, :content, :metadata)`,
    {
      id,
      month_id: input.month_id,
      role: input.role,
      content: input.content,
      // jsonb virou TEXT: serializa na escrita, desserializa na leitura.
      metadata:
        input.metadata === undefined ? null : JSON.stringify(input.metadata),
    }
  );
  return (await findAiConversation(id))!;
}

async function findAiConversation(
  id: string
): Promise<AiConversationEntry | null> {
  const row = get<Record<string, unknown>>(
    "SELECT * FROM ai_conversations WHERE id = :id",
    { id }
  );
  return row ? (parseAiRow(row) as AiConversationEntry) : null;
}

function parseAiRow(row: Record<string, unknown>): Record<string, unknown> {
  if (typeof row.metadata !== "string") return row;
  try {
    return { ...row, metadata: JSON.parse(row.metadata) };
  } catch {
    return { ...row, metadata: null };
  }
}

export async function listRecentAiConversations(
  limit = 50
): Promise<AiConversationEntry[]> {
  return all<Record<string, unknown>>(
    "SELECT * FROM ai_conversations ORDER BY created_at DESC LIMIT :limit",
    { limit }
  ).map((row) => parseAiRow(row) as AiConversationEntry);
}
