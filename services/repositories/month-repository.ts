import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import type { Month } from "@/types/domain";

type MonthInsert = Database["public"]["Tables"]["months"]["Insert"];
type MonthUpdate = Database["public"]["Tables"]["months"]["Update"];

export const monthRepository = {
  async findByYearMonth(year: number, month: number): Promise<Month | null> {
    const { data, error } = await createClient()
      .from("months")
      .select("*")
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  async findById(id: string): Promise<Month | null> {
    const { data, error } = await createClient()
      .from("months")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  /** Mês aberto mais recente — o app trabalha sempre sobre ele. */
  async findLatestOpen(): Promise<Month | null> {
    const { data, error } = await createClient()
      .from("months")
      .select("*")
      .eq("closed", false)
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  /** Mês fechado mais recente — base para sugerir a abertura do próximo. */
  async findLatest(): Promise<Month | null> {
    const { data, error } = await createClient()
      .from("months")
      .select("*")
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  async findLatestBefore(year: number, month: number): Promise<Month | null> {
    const { data, error } = await createClient()
      .from("months")
      .select("*")
      .or(`year.lt.${year},and(year.eq.${year},month.lt.${month})`)
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  async list(): Promise<Month[]> {
    const { data, error } = await createClient()
      .from("months")
      .select("*")
      .order("year", { ascending: false })
      .order("month", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  },

  async create(input: MonthInsert): Promise<Month> {
    const { data, error } = await createClient()
      .from("months")
      .insert(input)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async update(id: string, patch: MonthUpdate): Promise<Month> {
    const { data, error } = await createClient()
      .from("months")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
};
