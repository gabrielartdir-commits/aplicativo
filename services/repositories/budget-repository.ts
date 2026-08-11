import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import type { BudgetWithCategory, MonthlyCategoryBudget } from "@/types/domain";

type BudgetInsert =
  Database["public"]["Tables"]["monthly_category_budgets"]["Insert"];

export const budgetRepository = {
  async listByMonth(monthId: string): Promise<BudgetWithCategory[]> {
    const { data, error } = await createClient()
      .from("monthly_category_budgets")
      .select("*, category:categories(*)")
      .eq("month_id", monthId);
    if (error) throw new Error(error.message);
    const budgets = (data ?? []) as BudgetWithCategory[];
    return budgets.sort(
      (a, b) => a.category.sort_order - b.category.sort_order
    );
  },

  async findByMonthAndCategory(
    monthId: string,
    categoryId: string
  ): Promise<MonthlyCategoryBudget | null> {
    const { data, error } = await createClient()
      .from("monthly_category_budgets")
      .select("*")
      .eq("month_id", monthId)
      .eq("category_id", categoryId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  async createMany(inputs: BudgetInsert[]): Promise<void> {
    if (inputs.length === 0) return;
    const { error } = await createClient()
      .from("monthly_category_budgets")
      .insert(inputs);
    if (error) throw new Error(error.message);
  },

  async updateSpent(id: string, spent: number): Promise<void> {
    const { error } = await createClient()
      .from("monthly_category_budgets")
      .update({ spent })
      .eq("id", id);
    if (error) throw new Error(error.message);
  },

  async updateCurrentLimit(id: string, currentLimit: number): Promise<void> {
    const { error } = await createClient()
      .from("monthly_category_budgets")
      .update({ current_limit: currentLimit })
      .eq("id", id);
    if (error) throw new Error(error.message);
  },

  /** Zera o gasto de todas as categorias do mês — usado no reset. */
  async resetSpentByMonth(monthId: string): Promise<void> {
    const { error } = await createClient()
      .from("monthly_category_budgets")
      .update({ spent: 0 })
      .eq("month_id", monthId);
    if (error) throw new Error(error.message);
  },
};
