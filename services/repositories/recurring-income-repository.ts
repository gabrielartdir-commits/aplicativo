import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import type { RecurringIncome } from "@/types/domain";

type RecurringIncomeInsert =
  Database["public"]["Tables"]["recurring_incomes"]["Insert"];
type RecurringIncomeUpdate =
  Database["public"]["Tables"]["recurring_incomes"]["Update"];

export const recurringIncomeRepository = {
  async list(): Promise<RecurringIncome[]> {
    const { data, error } = await createClient()
      .from("recurring_incomes")
      .select("*")
      .order("sort_order")
      .order("created_at");
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async findById(id: string): Promise<RecurringIncome | null> {
    const { data, error } = await createClient()
      .from("recurring_incomes")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  /** Soma das entradas ativas — vira o `salary` do mês na abertura. */
  async activeTotal(): Promise<number> {
    const { data, error } = await createClient()
      .from("recurring_incomes")
      .select("amount")
      .eq("active", true);
    if (error) throw new Error(error.message);
    return (data ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
  },

  async create(input: RecurringIncomeInsert): Promise<RecurringIncome> {
    const { data, error } = await createClient()
      .from("recurring_incomes")
      .insert(input)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async update(
    id: string,
    patch: RecurringIncomeUpdate
  ): Promise<RecurringIncome> {
    const { data, error } = await createClient()
      .from("recurring_incomes")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async remove(id: string): Promise<void> {
    const { error } = await createClient()
      .from("recurring_incomes")
      .delete()
      .eq("id", id);
    if (error) throw new Error(error.message);
  },
};
