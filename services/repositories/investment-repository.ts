import { createClient } from "@/lib/supabase/client";
import type { Investment } from "@/types/domain";

export const investmentRepository = {
  async listByMonth(monthId: string): Promise<Investment[]> {
    const { data, error } = await createClient()
      .from("investments")
      .select("*")
      .eq("month_id", monthId);
    if (error) throw new Error(error.message);
    return data || [];
  },

  async listAll(): Promise<Investment[]> {
    const { data, error } = await createClient()
      .from("investments")
      .select("*");
    if (error) throw new Error(error.message);
    return data || [];
  },

  async create(input: {
    month_id: string;
    amount: number;
    description?: string | null;
  }): Promise<Investment> {
    const { data, error } = await createClient()
      .from("investments")
      .insert(input)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async removeByMonthAndAmountAndDescription(
    monthId: string,
    amount: number,
    description: string
  ): Promise<void> {
    const { error } = await createClient()
      .from("investments")
      .delete()
      .eq("month_id", monthId)
      .eq("amount", amount)
      .eq("description", description);
    if (error) throw new Error(error.message);
  },

  /** Apaga todos os aportes do mês — usado no reset. */
  async removeByMonth(monthId: string): Promise<void> {
    const { error } = await createClient()
      .from("investments")
      .delete()
      .eq("month_id", monthId);
    if (error) throw new Error(error.message);
  },
};
