/**
 * Tipos do banco Supabase — mantidos em sincronia com
 * supabase/migrations/. Quando houver acesso ao projeto, substituir
 * pelo codegen oficial:
 *   npx supabase gen types typescript --project-id <id> > types/database.ts
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type TransactionType = "expense" | "income" | "adjustment" | "investment";
export type TransactionSource = "manual" | "ai" | "simulation";
export type AdjustmentType = "entry" | "exit" | "correction" | "transfer";
export type PaymentMethod = "credit" | "debit";

export type Database = {
  public: {
    Tables: {
      vault: {
        Row: {
          id: string;
          name: string;
          access_key_hash: string;
          investment_goal: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          access_key_hash: string;
          investment_goal?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          access_key_hash?: string;
          investment_goal?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      months: {
        Row: {
          id: string;
          month: number;
          year: number;
          starting_balance: number;
          salary: number;
          extra_income: number;
          bank_balance: number;
          reserved_fixed_expenses: number;
          reserved_investment: number;
          reserved_invoices: number;
          available_balance: number;
          closed: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          month: number;
          year: number;
          starting_balance?: number;
          salary?: number;
          extra_income?: number;
          bank_balance?: number;
          reserved_fixed_expenses?: number;
          reserved_investment?: number;
          reserved_invoices?: number;
          available_balance?: number;
          closed?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          month?: number;
          year?: number;
          starting_balance?: number;
          salary?: number;
          extra_income?: number;
          bank_balance?: number;
          reserved_fixed_expenses?: number;
          reserved_investment?: number;
          reserved_invoices?: number;
          available_balance?: number;
          closed?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      fixed_expenses: {
        Row: {
          id: string;
          name: string;
          amount: number;
          due_day: number;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          amount: number;
          due_day: number;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          amount?: number;
          due_day?: number;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      fixed_expense_payments: {
        Row: {
          id: string;
          month_id: string;
          fixed_expense_id: string;
          amount: number;
          paid_at: string;
        };
        Insert: {
          id?: string;
          month_id: string;
          fixed_expense_id: string;
          amount: number;
          paid_at?: string;
        };
        Update: {
          id?: string;
          month_id?: string;
          fixed_expense_id?: string;
          amount?: number;
          paid_at?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          emoji: string;
          name: string;
          default_limit: number;
          color: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          emoji?: string;
          name: string;
          default_limit?: number;
          color?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          emoji?: string;
          name?: string;
          default_limit?: number;
          color?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      monthly_category_budgets: {
        Row: {
          id: string;
          month_id: string;
          category_id: string;
          planned_limit: number;
          current_limit: number;
          spent: number;
          remaining: number;
        };
        Insert: {
          id?: string;
          month_id: string;
          category_id: string;
          planned_limit?: number;
          current_limit?: number;
          spent?: number;
        };
        Update: {
          id?: string;
          month_id?: string;
          category_id?: string;
          planned_limit?: number;
          current_limit?: number;
          spent?: number;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          month_id: string;
          category_id: string | null;
          type: TransactionType;
          amount: number;
          description: string | null;
          source: TransactionSource;
          date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          month_id: string;
          category_id?: string | null;
          type: TransactionType;
          amount: number;
          description?: string | null;
          source?: TransactionSource;
          date?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          month_id?: string;
          category_id?: string | null;
          type?: TransactionType;
          amount?: number;
          description?: string | null;
          source?: TransactionSource;
          date?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      balance_adjustments: {
        Row: {
          id: string;
          month_id: string;
          type: AdjustmentType;
          amount: number;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          month_id: string;
          type: AdjustmentType;
          amount: number;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          month_id?: string;
          type?: AdjustmentType;
          amount?: number;
          description?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      investments: {
        Row: {
          id: string;
          month_id: string;
          amount: number;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          month_id: string;
          amount: number;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          month_id?: string;
          amount?: number;
          description?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      ai_conversations: {
        Row: {
          id: string;
          month_id: string | null;
          role: "user" | "assistant";
          content: string;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          month_id?: string | null;
          role: "user" | "assistant";
          content: string;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          month_id?: string | null;
          role?: "user" | "assistant";
          content?: string;
          metadata?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      credit_cards: {
        Row: {
          id: string;
          name: string;
          closing_day: number;
          due_day: number;
          credit_limit: number;
          color: string | null;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          closing_day: number;
          due_day: number;
          credit_limit?: number;
          color?: string | null;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          closing_day?: number;
          due_day?: number;
          credit_limit?: number;
          color?: string | null;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      card_purchases: {
        Row: {
          id: string;
          card_id: string;
          category_id: string | null;
          description: string;
          total_amount: number;
          installments_count: number;
          purchase_date: string;
          first_charge_year: number;
          first_charge_month: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          card_id: string;
          category_id?: string | null;
          description: string;
          total_amount: number;
          installments_count?: number;
          purchase_date?: string;
          first_charge_year: number;
          first_charge_month: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          card_id?: string;
          category_id?: string | null;
          description?: string;
          total_amount?: number;
          installments_count?: number;
          purchase_date?: string;
          first_charge_year?: number;
          first_charge_month?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      card_installments: {
        Row: {
          id: string;
          purchase_id: string;
          installment_no: number;
          year: number;
          month: number;
          amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          purchase_id: string;
          installment_no: number;
          year: number;
          month: number;
          amount: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          purchase_id?: string;
          installment_no?: number;
          year?: number;
          month?: number;
          amount?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          name: string;
          amount: number;
          billing_day: number;
          payment_method: PaymentMethod;
          card_id: string | null;
          category_id: string | null;
          active: boolean;
          /** Competência a partir da qual a assinatura entra nas faturas. */
          start_year: number;
          start_month: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          amount: number;
          billing_day: number;
          payment_method?: PaymentMethod;
          card_id?: string | null;
          category_id?: string | null;
          active?: boolean;
          start_year?: number;
          start_month?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          amount?: number;
          billing_day?: number;
          payment_method?: PaymentMethod;
          card_id?: string | null;
          category_id?: string | null;
          active?: boolean;
          start_year?: number;
          start_month?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      card_invoices: {
        Row: {
          id: string;
          card_id: string;
          year: number;
          month: number;
          installments_total: number;
          subscriptions_total: number;
          /** Coluna gerada: installments_total + subscriptions_total. */
          total: number;
          due_date: string;
          paid: boolean;
          paid_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          card_id: string;
          year: number;
          month: number;
          installments_total?: number;
          subscriptions_total?: number;
          due_date: string;
          paid?: boolean;
          paid_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          card_id?: string;
          year?: number;
          month?: number;
          installments_total?: number;
          subscriptions_total?: number;
          due_date?: string;
          paid?: boolean;
          paid_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      transaction_type: TransactionType;
      transaction_source: TransactionSource;
      adjustment_type: AdjustmentType;
      payment_method: PaymentMethod;
    };
    CompositeTypes: Record<string, never>;
  };
};
