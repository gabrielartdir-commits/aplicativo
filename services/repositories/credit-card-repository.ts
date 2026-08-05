import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import type { CreditCard } from "@/types/domain";

type CreditCardInsert = Database["public"]["Tables"]["credit_cards"]["Insert"];
type CreditCardUpdate = Database["public"]["Tables"]["credit_cards"]["Update"];

export const creditCardRepository = {
  async list(): Promise<CreditCard[]> {
    const { data, error } = await createClient()
      .from("credit_cards")
      .select("*")
      .order("name");
    if (error) throw new Error(error.message);
    return data;
  },

  async listActive(): Promise<CreditCard[]> {
    const { data, error } = await createClient()
      .from("credit_cards")
      .select("*")
      .eq("active", true)
      .order("name");
    if (error) throw new Error(error.message);
    return data;
  },

  async create(input: CreditCardInsert): Promise<CreditCard> {
    const { data, error } = await createClient()
      .from("credit_cards")
      .insert(input)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async update(id: string, patch: CreditCardUpdate): Promise<CreditCard> {
    const { data, error } = await createClient()
      .from("credit_cards")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async remove(id: string): Promise<void> {
    const { error } = await createClient()
      .from("credit_cards")
      .delete()
      .eq("id", id);
    if (error) throw new Error(error.message);
  },
};
