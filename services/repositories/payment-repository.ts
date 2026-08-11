import { createClient } from "@/lib/supabase/client";
import type { FixedExpensePayment } from "@/types/domain";

export const paymentRepository = {
  async listByMonth(monthId: string): Promise<FixedExpensePayment[]> {
    const { data, error } = await createClient()
      .from("fixed_expense_payments")
      .select("*")
      .eq("month_id", monthId);
    if (error) throw new Error(error.message);
    return data;
  },

  async create(input: {
    month_id: string;
    fixed_expense_id: string;
    amount: number;
  }): Promise<FixedExpensePayment> {
    const { data, error } = await createClient()
      .from("fixed_expense_payments")
      .insert(input)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async remove(monthId: string, fixedExpenseId: string): Promise<void> {
    const { error } = await createClient()
      .from("fixed_expense_payments")
      .delete()
      .eq("month_id", monthId)
      .eq("fixed_expense_id", fixedExpenseId);
    if (error) throw new Error(error.message);
  },

  /** Apaga todos os pagamentos de gastos fixos do mês — usado no reset. */
  async removeByMonth(monthId: string): Promise<void> {
    const { error } = await createClient()
      .from("fixed_expense_payments")
      .delete()
      .eq("month_id", monthId);
    if (error) throw new Error(error.message);
  },
};
