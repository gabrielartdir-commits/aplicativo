"use server";

import { all, buildUpdate, get, newId, nowIso, run, transaction } from "@/lib/db";
import type { Database } from "@/types/database";
import type {
  CardInstallment,
  CardInvoice,
  CardPurchase,
  CreditCard,
  InstallmentWithPurchase,
  InvoiceWithCard,
  PurchaseWithInstallments,
  Subscription,
  SubscriptionWithCard,
} from "@/types/domain";
import { listCategories } from "./core.actions";

type CreditCardInsert = Database["public"]["Tables"]["credit_cards"]["Insert"];
type CreditCardUpdate = Database["public"]["Tables"]["credit_cards"]["Update"];
type CardPurchaseInsert =
  Database["public"]["Tables"]["card_purchases"]["Insert"];
type CardPurchaseUpdate =
  Database["public"]["Tables"]["card_purchases"]["Update"];
type CardInstallmentInsert =
  Database["public"]["Tables"]["card_installments"]["Insert"];
type SubscriptionInsert =
  Database["public"]["Tables"]["subscriptions"]["Insert"];
type SubscriptionUpdate =
  Database["public"]["Tables"]["subscriptions"]["Update"];
type CardInvoiceInsert = Database["public"]["Tables"]["card_invoices"]["Insert"];
type CardInvoiceUpdate = Database["public"]["Tables"]["card_invoices"]["Update"];

type Row = Record<string, unknown>;

function toCard(row: Row): CreditCard {
  return { ...row, active: Boolean(row.active) } as CreditCard;
}

function toSubscription(row: Row): Subscription {
  return { ...row, active: Boolean(row.active) } as Subscription;
}

function toInvoice(row: Row): CardInvoice {
  return { ...row, paid: Boolean(row.paid) } as CardInvoice;
}

// ------------------------------------------------------- credit cards

export async function listCreditCards(): Promise<CreditCard[]> {
  return all("SELECT * FROM credit_cards ORDER BY name").map(toCard);
}

export async function listActiveCreditCards(): Promise<CreditCard[]> {
  return all("SELECT * FROM credit_cards WHERE active = 1 ORDER BY name").map(
    toCard
  );
}

async function findCard(id: string): Promise<CreditCard | null> {
  const row = get<Row>("SELECT * FROM credit_cards WHERE id = :id", { id });
  return row ? toCard(row) : null;
}

export async function createCreditCard(
  input: CreditCardInsert
): Promise<CreditCard> {
  const id = input.id ?? newId();
  run(
    `INSERT INTO credit_cards
       (id, name, closing_day, due_day, credit_limit, color, active)
     VALUES (:id, :name, :closing_day, :due_day, :credit_limit, :color, :active)`,
    {
      id,
      name: input.name,
      closing_day: input.closing_day,
      due_day: input.due_day,
      credit_limit: input.credit_limit ?? 0,
      color: input.color ?? null,
      active: input.active ?? true,
    }
  );
  return (await findCard(id))!;
}

export async function updateCreditCard(
  id: string,
  patch: CreditCardUpdate
): Promise<CreditCard> {
  const update = buildUpdate(patch, [
    "name",
    "closing_day",
    "due_day",
    "credit_limit",
    "color",
    "active",
  ]);
  if (update) {
    run(`UPDATE credit_cards SET ${update.clause} WHERE id = :id`, {
      ...update.params,
      id,
    });
  }
  return (await findCard(id))!;
}

export async function removeCreditCard(id: string): Promise<void> {
  run("DELETE FROM credit_cards WHERE id = :id", { id });
}

// ---------------------------------------------------- card purchases

/** Compras com cartão, categoria e parcelas — o join do Supabase à mão. */
export async function listPurchasesWithInstallments(): Promise<
  PurchaseWithInstallments[]
> {
  const purchases = all<CardPurchase>(
    "SELECT * FROM card_purchases ORDER BY purchase_date DESC"
  );
  if (purchases.length === 0) return [];

  const cards = new Map((await listCreditCards()).map((c) => [c.id, c]));
  const categories = new Map((await listCategories()).map((c) => [c.id, c]));
  const installments = all<CardInstallment>(
    "SELECT * FROM card_installments ORDER BY year, month, installment_no"
  );

  const byPurchase = new Map<string, CardInstallment[]>();
  for (const inst of installments) {
    const list = byPurchase.get(inst.purchase_id) ?? [];
    list.push(inst);
    byPurchase.set(inst.purchase_id, list);
  }

  return purchases
    .filter((p) => cards.has(p.card_id))
    .map((purchase) => ({
      ...purchase,
      card: cards.get(purchase.card_id)!,
      category: purchase.category_id
        ? (categories.get(purchase.category_id) ?? null)
        : null,
      installments: byPurchase.get(purchase.id) ?? [],
    }));
}

export async function createCardPurchase(
  input: CardPurchaseInsert
): Promise<CardPurchase> {
  const id = input.id ?? newId();
  run(
    `INSERT INTO card_purchases (
       id, card_id, category_id, description, total_amount, installments_count,
       first_installment_no, purchase_date, first_charge_year, first_charge_month
     ) VALUES (
       :id, :card_id, :category_id, :description, :total_amount,
       :installments_count, :first_installment_no,
       COALESCE(:purchase_date, date('now')), :first_charge_year,
       :first_charge_month
     )`,
    {
      id,
      card_id: input.card_id,
      category_id: input.category_id ?? null,
      description: input.description,
      total_amount: input.total_amount,
      installments_count: input.installments_count ?? 1,
      first_installment_no: input.first_installment_no ?? 1,
      purchase_date: input.purchase_date ?? null,
      first_charge_year: input.first_charge_year,
      first_charge_month: input.first_charge_month,
    }
  );
  return get<CardPurchase>("SELECT * FROM card_purchases WHERE id = :id", {
    id,
  })!;
}

export async function updateCardPurchase(
  id: string,
  patch: CardPurchaseUpdate
): Promise<CardPurchase> {
  const update = buildUpdate(patch, [
    "card_id",
    "category_id",
    "description",
    "total_amount",
    "installments_count",
    "first_installment_no",
    "purchase_date",
    "first_charge_year",
    "first_charge_month",
  ]);
  if (update) {
    run(`UPDATE card_purchases SET ${update.clause} WHERE id = :id`, {
      ...update.params,
      id,
    });
  }
  return get<CardPurchase>("SELECT * FROM card_purchases WHERE id = :id", {
    id,
  })!;
}

export async function removeCardPurchase(id: string): Promise<void> {
  run("DELETE FROM card_purchases WHERE id = :id", { id });
}

// -------------------------------------------------- card installments

async function hydrateInstallments(
  rows: CardInstallment[]
): Promise<InstallmentWithPurchase[]> {
  if (rows.length === 0) return [];

  const purchases = new Map(
    all<CardPurchase>("SELECT * FROM card_purchases").map((p) => [p.id, p])
  );
  const cards = new Map((await listCreditCards()).map((c) => [c.id, c]));
  const categories = new Map((await listCategories()).map((c) => [c.id, c]));

  return rows
    .map((inst) => {
      const purchase = purchases.get(inst.purchase_id);
      if (!purchase) return null;
      const card = cards.get(purchase.card_id);
      if (!card) return null;
      return {
        ...inst,
        purchase: {
          ...purchase,
          card,
          category: purchase.category_id
            ? (categories.get(purchase.category_id) ?? null)
            : null,
        },
      };
    })
    .filter((row): row is InstallmentWithPurchase => row !== null);
}

export async function listInstallmentsByCompetence(
  year: number,
  month: number
): Promise<InstallmentWithPurchase[]> {
  return hydrateInstallments(
    all<CardInstallment>(
      "SELECT * FROM card_installments WHERE year = :year AND month = :month",
      { year, month }
    )
  );
}

export async function listInstallmentsByCardAndCompetence(
  cardId: string,
  year: number,
  month: number
): Promise<InstallmentWithPurchase[]> {
  return hydrateInstallments(
    all<CardInstallment>(
      `SELECT i.* FROM card_installments i
       JOIN card_purchases p ON p.id = i.purchase_id
       WHERE i.year = :year AND i.month = :month AND p.card_id = :cardId`,
      { cardId, year, month }
    )
  );
}

export async function listUpcomingInstallments(
  fromYear: number,
  fromMonth: number
): Promise<InstallmentWithPurchase[]> {
  return hydrateInstallments(
    all<CardInstallment>(
      `SELECT * FROM card_installments
       WHERE year > :fromYear OR (year = :fromYear AND month >= :fromMonth)
       ORDER BY year, month`,
      { fromYear, fromMonth }
    )
  );
}

export async function createInstallments(
  rows: CardInstallmentInsert[]
): Promise<CardInstallment[]> {
  if (rows.length === 0) return [];
  const ids: string[] = [];

  transaction(() => {
    for (const row of rows) {
      const id = row.id ?? newId();
      ids.push(id);
      run(
        `INSERT INTO card_installments
           (id, purchase_id, installment_no, year, month, amount)
         VALUES (:id, :purchase_id, :installment_no, :year, :month, :amount)`,
        {
          id,
          purchase_id: row.purchase_id,
          installment_no: row.installment_no,
          year: row.year,
          month: row.month,
          amount: row.amount,
        }
      );
    }
  });

  return ids.map(
    (id) =>
      get<CardInstallment>("SELECT * FROM card_installments WHERE id = :id", {
        id,
      })!
  );
}

export async function removeInstallmentsByPurchase(
  purchaseId: string
): Promise<void> {
  run("DELETE FROM card_installments WHERE purchase_id = :purchaseId", {
    purchaseId,
  });
}

// ------------------------------------------------------ subscriptions

async function hydrateSubscriptions(
  rows: Subscription[]
): Promise<SubscriptionWithCard[]> {
  const cards = new Map((await listCreditCards()).map((c) => [c.id, c]));
  const categories = new Map((await listCategories()).map((c) => [c.id, c]));
  return rows.map((sub) => ({
    ...sub,
    card: sub.card_id ? (cards.get(sub.card_id) ?? null) : null,
    category: sub.category_id ? (categories.get(sub.category_id) ?? null) : null,
  }));
}

export async function listSubscriptions(): Promise<SubscriptionWithCard[]> {
  return hydrateSubscriptions(
    all("SELECT * FROM subscriptions ORDER BY billing_day").map(toSubscription)
  );
}

export async function listActiveSubscriptions(): Promise<
  SubscriptionWithCard[]
> {
  return hydrateSubscriptions(
    all("SELECT * FROM subscriptions WHERE active = 1 ORDER BY billing_day").map(
      toSubscription
    )
  );
}

/**
 * Assinaturas no crédito de um cartão que já valiam na competência.
 * `start_year` nulo significa "desde sempre" — assinatura cadastrada antes
 * de o campo existir.
 */
export async function listActiveSubscriptionsByCardForCompetence(
  cardId: string,
  year: number,
  month: number
): Promise<Subscription[]> {
  return all(
    `SELECT * FROM subscriptions
     WHERE active = 1 AND payment_method = 'credit' AND card_id = :cardId
       AND (
         start_year IS NULL
         OR start_year < :year
         OR (start_year = :year AND COALESCE(start_month, 1) <= :month)
       )`,
    { cardId, year, month }
  ).map(toSubscription);
}

export async function createSubscription(
  input: SubscriptionInsert
): Promise<Subscription> {
  const id = input.id ?? newId();
  run(
    `INSERT INTO subscriptions (
       id, name, amount, billing_day, payment_method, card_id, category_id,
       start_year, start_month, active
     ) VALUES (
       :id, :name, :amount, :billing_day, :payment_method, :card_id,
       :category_id, :start_year, :start_month, :active
     )`,
    {
      id,
      name: input.name,
      amount: input.amount ?? 0,
      billing_day: input.billing_day,
      payment_method: input.payment_method ?? "credit",
      card_id: input.card_id ?? null,
      category_id: input.category_id ?? null,
      start_year: input.start_year ?? null,
      start_month: input.start_month ?? null,
      active: input.active ?? true,
    }
  );
  return toSubscription(
    get<Row>("SELECT * FROM subscriptions WHERE id = :id", { id })!
  );
}

export async function updateSubscription(
  id: string,
  patch: SubscriptionUpdate
): Promise<Subscription> {
  const update = buildUpdate(patch, [
    "name",
    "amount",
    "billing_day",
    "payment_method",
    "card_id",
    "category_id",
    "start_year",
    "start_month",
    "active",
  ]);
  if (update) {
    run(`UPDATE subscriptions SET ${update.clause} WHERE id = :id`, {
      ...update.params,
      id,
    });
  }
  return toSubscription(
    get<Row>("SELECT * FROM subscriptions WHERE id = :id", { id })!
  );
}

export async function removeSubscription(id: string): Promise<void> {
  run("DELETE FROM subscriptions WHERE id = :id", { id });
}

// ------------------------------------------------------ card invoices

async function hydrateInvoices(rows: CardInvoice[]): Promise<InvoiceWithCard[]> {
  const cards = new Map((await listCreditCards()).map((c) => [c.id, c]));
  return rows
    .filter((inv) => cards.has(inv.card_id))
    .map((inv) => ({ ...inv, card: cards.get(inv.card_id)! }));
}

export async function listInvoicesByCompetence(
  year: number,
  month: number
): Promise<InvoiceWithCard[]> {
  return hydrateInvoices(
    all("SELECT * FROM card_invoices WHERE year = :year AND month = :month ORDER BY due_date", {
      year,
      month,
    }).map(toInvoice)
  );
}

export async function listAllInvoices(): Promise<InvoiceWithCard[]> {
  return hydrateInvoices(
    all("SELECT * FROM card_invoices ORDER BY year, month").map(toInvoice)
  );
}

export async function findInvoiceByCardAndCompetence(
  cardId: string,
  year: number,
  month: number
): Promise<CardInvoice | null> {
  const row = get<Row>(
    `SELECT * FROM card_invoices
     WHERE card_id = :cardId AND year = :year AND month = :month`,
    { cardId, year, month }
  );
  return row ? toInvoice(row) : null;
}

/**
 * Insere ou atualiza a fatura da competência.
 *
 * `total` é coluna gerada e não pode ser escrita — por isso o UPSERT lista
 * apenas as colunas de origem.
 */
export async function upsertInvoice(
  input: CardInvoiceInsert
): Promise<CardInvoice> {
  run(
    `INSERT INTO card_invoices (
       id, card_id, year, month, installments_total, subscriptions_total,
       declared_total, due_date, paid, paid_at
     ) VALUES (
       :id, :card_id, :year, :month, :installments_total, :subscriptions_total,
       :declared_total, :due_date, :paid, :paid_at
     )
     ON CONFLICT (card_id, year, month) DO UPDATE SET
       installments_total = excluded.installments_total,
       subscriptions_total = excluded.subscriptions_total,
       declared_total = excluded.declared_total,
       due_date = excluded.due_date,
       paid = excluded.paid,
       paid_at = excluded.paid_at`,
    {
      id: input.id ?? newId(),
      card_id: input.card_id,
      year: input.year,
      month: input.month,
      installments_total: input.installments_total ?? 0,
      subscriptions_total: input.subscriptions_total ?? 0,
      declared_total: input.declared_total ?? null,
      due_date: input.due_date,
      paid: input.paid ?? false,
      paid_at: input.paid_at ?? null,
    }
  );
  return (await findInvoiceByCardAndCompetence(
    input.card_id,
    input.year,
    input.month
  ))!;
}

export async function updateInvoice(
  id: string,
  patch: CardInvoiceUpdate
): Promise<CardInvoice> {
  // Marcar como paga carimba a data; desmarcar limpa.
  const normalized: CardInvoiceUpdate = { ...patch };
  if (patch.paid !== undefined && patch.paid_at === undefined) {
    normalized.paid_at = patch.paid ? nowIso() : null;
  }

  const update = buildUpdate(normalized, [
    "card_id",
    "year",
    "month",
    "installments_total",
    "subscriptions_total",
    "declared_total",
    "due_date",
    "paid",
    "paid_at",
  ]);
  if (update) {
    run(`UPDATE card_invoices SET ${update.clause} WHERE id = :id`, {
      ...update.params,
      id,
    });
  }
  return toInvoice(get<Row>("SELECT * FROM card_invoices WHERE id = :id", { id })!);
}

export async function openInvoiceTotalByCompetence(
  year: number,
  month: number
): Promise<number> {
  const row = get<{ total: number | null }>(
    `SELECT SUM(total) AS total FROM card_invoices
     WHERE year = :year AND month = :month AND paid = 0`,
    { year, month }
  );
  return Number(row?.total ?? 0);
}
