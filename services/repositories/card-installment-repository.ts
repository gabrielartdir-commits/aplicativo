import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import type { CardInstallment, InstallmentWithPurchase } from "@/types/domain";

type CardInstallmentInsert =
  Database["public"]["Tables"]["card_installments"]["Insert"];

const WITH_PURCHASE = `
  *,
  purchase:card_purchases!inner (
    *,
    card:credit_cards (*),
    category:categories (*)
  )
`;

export const cardInstallmentRepository = {
  /** Parcelas de uma competência, com a compra e o cartão de origem. */
  async listByCompetence(
    year: number,
    month: number
  ): Promise<InstallmentWithPurchase[]> {
    const { data, error } = await createClient()
      .from("card_installments")
      .select(WITH_PURCHASE)
      .eq("year", year)
      .eq("month", month);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as InstallmentWithPurchase[];
  },

  /** Parcelas de uma competência de um cartão específico. */
  async listByCardAndCompetence(
    cardId: string,
    year: number,
    month: number
  ): Promise<InstallmentWithPurchase[]> {
    const { data, error } = await createClient()
      .from("card_installments")
      .select(WITH_PURCHASE)
      .eq("year", year)
      .eq("month", month)
      .eq("purchase.card_id", cardId);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as InstallmentWithPurchase[];
  },

  /** Todas as parcelas a partir de uma competência — alimenta o calendário. */
  async listUpcoming(
    fromYear: number,
    fromMonth: number
  ): Promise<InstallmentWithPurchase[]> {
    const { data, error } = await createClient()
      .from("card_installments")
      .select(WITH_PURCHASE)
      .or(`year.gt.${fromYear},and(year.eq.${fromYear},month.gte.${fromMonth})`)
      .order("year")
      .order("month");
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as InstallmentWithPurchase[];
  },

  async createMany(rows: CardInstallmentInsert[]): Promise<CardInstallment[]> {
    const { data, error } = await createClient()
      .from("card_installments")
      .insert(rows)
      .select();
    if (error) throw new Error(error.message);
    return data;
  },

  async removeByPurchase(purchaseId: string): Promise<void> {
    const { error } = await createClient()
      .from("card_installments")
      .delete()
      .eq("purchase_id", purchaseId);
    if (error) throw new Error(error.message);
  },
};
