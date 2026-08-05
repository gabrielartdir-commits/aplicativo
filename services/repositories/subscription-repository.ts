import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import type { Subscription, SubscriptionWithCard } from "@/types/domain";

type SubscriptionInsert =
  Database["public"]["Tables"]["subscriptions"]["Insert"];
type SubscriptionUpdate =
  Database["public"]["Tables"]["subscriptions"]["Update"];

const WITH_RELATIONS = `
  *,
  card:credit_cards (*),
  category:categories (*)
`;

export const subscriptionRepository = {
  async list(): Promise<SubscriptionWithCard[]> {
    const { data, error } = await createClient()
      .from("subscriptions")
      .select(WITH_RELATIONS)
      .order("billing_day");
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as SubscriptionWithCard[];
  },

  async listActive(): Promise<SubscriptionWithCard[]> {
    const { data, error } = await createClient()
      .from("subscriptions")
      .select(WITH_RELATIONS)
      .eq("active", true)
      .order("billing_day");
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as SubscriptionWithCard[];
  },

  /** Assinaturas ativas cobradas no crédito de um cartão — compõem a fatura. */
  async listActiveByCard(cardId: string): Promise<Subscription[]> {
    const { data, error } = await createClient()
      .from("subscriptions")
      .select("*")
      .eq("active", true)
      .eq("payment_method", "credit")
      .eq("card_id", cardId);
    if (error) throw new Error(error.message);
    return data;
  },

  async create(input: SubscriptionInsert): Promise<Subscription> {
    const { data, error } = await createClient()
      .from("subscriptions")
      .insert(input)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async update(id: string, patch: SubscriptionUpdate): Promise<Subscription> {
    const { data, error } = await createClient()
      .from("subscriptions")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async remove(id: string): Promise<void> {
    const { error } = await createClient()
      .from("subscriptions")
      .delete()
      .eq("id", id);
    if (error) throw new Error(error.message);
  },
};
