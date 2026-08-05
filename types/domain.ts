import type { Database } from "./database";

type Tables = Database["public"]["Tables"];

export type Vault = Tables["vault"]["Row"];
export type Month = Tables["months"]["Row"];
export type FixedExpense = Tables["fixed_expenses"]["Row"];
export type FixedExpensePayment = Tables["fixed_expense_payments"]["Row"];
export type Category = Tables["categories"]["Row"];
export type MonthlyCategoryBudget = Tables["monthly_category_budgets"]["Row"];
export type Transaction = Tables["transactions"]["Row"];
export type BalanceAdjustment = Tables["balance_adjustments"]["Row"];
export type Investment = Tables["investments"]["Row"];
export type AiConversationEntry = Tables["ai_conversations"]["Row"];
export type CreditCard = Tables["credit_cards"]["Row"];
export type CardPurchase = Tables["card_purchases"]["Row"];
export type CardInstallment = Tables["card_installments"]["Row"];
export type Subscription = Tables["subscriptions"]["Row"];
export type CardInvoice = Tables["card_invoices"]["Row"];

/** Orçamento mensal com a categoria associada (join usado na Home). */
export type BudgetWithCategory = MonthlyCategoryBudget & {
  category: Category;
};

/** Transação com a categoria associada (join usado no Histórico). */
export type TransactionWithCategory = Transaction & {
  category: Category | null;
};

/** Parcela com a compra e o cartão de origem (usado no calendário de parcelas). */
export type InstallmentWithPurchase = CardInstallment & {
  purchase: CardPurchase & { card: CreditCard; category: Category | null };
};

/** Compra parcelada com todas as suas parcelas (usado na lista de parcelas). */
export type PurchaseWithInstallments = CardPurchase & {
  card: CreditCard;
  category: Category | null;
  installments: CardInstallment[];
};

/** Assinatura com o cartão em que é cobrada, quando for no crédito. */
export type SubscriptionWithCard = Subscription & {
  card: CreditCard | null;
  category: Category | null;
};

/** Fatura com o cartão e a composição do total. */
export type InvoiceWithCard = CardInvoice & {
  card: CreditCard;
};
