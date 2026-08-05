import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import type { CardPurchase, PurchaseWithInstallments } from "@/types/domain";

type CardPurchaseInsert =
  Database["public"]["Tables"]["card_purchases"]["Insert"];
type CardPurchaseUpdate =
  Database["public"]["Tables"]["card_purchases"]["Update"];

const WITH_RELATIONS = `
  *,
  card:credit_cards (*),
  category:categories (*),
  installments:card_installments (*)
`;

export const cardPurchaseRepository = {
  /** Compras com cartão, categoria e parcelas — base da tela de Parcelas. */
  async listWithInstallments(): Promise<PurchaseWithInstallments[]> {
    const { data, error } = await createClient()
      .from("card_purchases")
      .select(WITH_RELATIONS)
      .order("purchase_date", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as PurchaseWithInstallments[];
  },

  async create(input: CardPurchaseInsert): Promise<CardPurchase> {
    const { data, error } = await createClient()
      .from("card_purchases")
      .insert(input)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async update(id: string, patch: CardPurchaseUpdate): Promise<CardPurchase> {
    const { data, error } = await createClient()
      .from("card_purchases")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  /** Remove a compra; as parcelas caem junto por cascade. */
  async remove(id: string): Promise<void> {
    const { error } = await createClient()
      .from("card_purchases")
      .delete()
      .eq("id", id);
    if (error) throw new Error(error.message);
  },
};
