import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import type { CardInvoice, InvoiceWithCard } from "@/types/domain";

type CardInvoiceInsert = Database["public"]["Tables"]["card_invoices"]["Insert"];
type CardInvoiceUpdate = Database["public"]["Tables"]["card_invoices"]["Update"];

const WITH_CARD = `*, card:credit_cards (*)`;

export const cardInvoiceRepository = {
  /** Faturas de uma competência, com o cartão — base da tela de Faturas. */
  async listByCompetence(
    year: number,
    month: number
  ): Promise<InvoiceWithCard[]> {
    const { data, error } = await createClient()
      .from("card_invoices")
      .select(WITH_CARD)
      .eq("year", year)
      .eq("month", month)
      .order("due_date");
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as InvoiceWithCard[];
  },

  async findByCardAndCompetence(
    cardId: string,
    year: number,
    month: number
  ): Promise<CardInvoice | null> {
    const { data, error } = await createClient()
      .from("card_invoices")
      .select("*")
      .eq("card_id", cardId)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  /** Cria ou atualiza a fatura da competência (unique card_id/year/month). */
  async upsert(input: CardInvoiceInsert): Promise<CardInvoice> {
    const { data, error } = await createClient()
      .from("card_invoices")
      .upsert(input, { onConflict: "card_id,year,month" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async update(id: string, patch: CardInvoiceUpdate): Promise<CardInvoice> {
    const { data, error } = await createClient()
      .from("card_invoices")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  /** Total das faturas ainda não pagas de uma competência. */
  async openTotalByCompetence(year: number, month: number): Promise<number> {
    const { data, error } = await createClient()
      .from("card_invoices")
      .select("total")
      .eq("year", year)
      .eq("month", month)
      .eq("paid", false);
    if (error) throw new Error(error.message);
    return (data ?? []).reduce((sum, row) => sum + Number(row.total), 0);
  },
};
