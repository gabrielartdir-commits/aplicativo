import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import type { BalanceAdjustment } from "@/types/domain";

type AdjustmentInsert =
  Database["public"]["Tables"]["balance_adjustments"]["Insert"];

export const adjustmentRepository = {
  async listByMonth(monthId: string): Promise<BalanceAdjustment[]> {
    const { data, error } = await createClient()
      .from("balance_adjustments")
      .select("*")
      .eq("month_id", monthId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  },

  async create(input: AdjustmentInsert): Promise<BalanceAdjustment> {
    const { data, error } = await createClient()
      .from("balance_adjustments")
      .insert(input)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async remove(id: string): Promise<void> {
    const { error } = await createClient()
      .from("balance_adjustments")
      .delete()
      .eq("id", id);
    if (error) throw new Error(error.message);
  },
};
