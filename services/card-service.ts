/**
 * Orquestração do eixo de crédito.
 *
 * A fatura de um cartão numa competência é sempre derivada do estado real:
 *
 *   fatura = Σ parcelas daquela competência + Σ assinaturas ativas no crédito
 *
 * Nada é somado incrementalmente — toda mudança recalcula a partir do banco,
 * pelo mesmo motivo que fixed-expense-service faz isso: subtração incremental
 * acumula descompasso quando uma operação falha no meio.
 */
import {
  applyInvoicePayment,
  applyInvoicesTotalChange,
  installmentCompetences,
  round2,
  splitInstallments,
} from "@/lib/finance";
import { dueDateInMonth, type YearMonth } from "@/lib/dates";
import type { Database } from "@/types/database";
import type { CardInvoice, Month } from "@/types/domain";
import { creditCardRepository } from "./repositories/credit-card-repository";
import { cardPurchaseRepository } from "./repositories/card-purchase-repository";
import { cardInstallmentRepository } from "./repositories/card-installment-repository";
import { subscriptionRepository } from "./repositories/subscription-repository";
import { cardInvoiceRepository } from "./repositories/card-invoice-repository";
import { monthRepository } from "./repositories/month-repository";

type SubscriptionInsert =
  Database["public"]["Tables"]["subscriptions"]["Insert"];
type SubscriptionUpdate =
  Database["public"]["Tables"]["subscriptions"]["Update"];

export interface CreatePurchaseInput {
  cardId: string;
  categoryId?: string | null;
  description: string;
  totalAmount: number;
  installmentsCount: number;
  purchaseDate: string;
  firstCharge: YearMonth;
}

export const cardService = {
  /**
   * Recalcula a fatura de um cartão numa competência a partir das parcelas e
   * das assinaturas, e devolve o total resultante.
   */
  async syncInvoice(
    cardId: string,
    competence: YearMonth
  ): Promise<CardInvoice> {
    const card = (await creditCardRepository.list()).find((c) => c.id === cardId);
    if (!card) throw new Error("Cartão não encontrado.");

    const installments = await cardInstallmentRepository.listByCardAndCompetence(
      cardId,
      competence.year,
      competence.month
    );
    const installmentsTotal = round2(
      installments.reduce((sum, i) => sum + Number(i.amount), 0)
    );

    const subscriptions = await subscriptionRepository.listActiveByCard(cardId);
    const subscriptionsTotal = round2(
      subscriptions.reduce((sum, s) => sum + Number(s.amount), 0)
    );

    const existing = await cardInvoiceRepository.findByCardAndCompetence(
      cardId,
      competence.year,
      competence.month
    );

    return cardInvoiceRepository.upsert({
      ...(existing ? { id: existing.id } : {}),
      card_id: cardId,
      year: competence.year,
      month: competence.month,
      installments_total: installmentsTotal,
      subscriptions_total: subscriptionsTotal,
      due_date: dueDateInMonth(competence, card.due_day),
      paid: existing?.paid ?? false,
      paid_at: existing?.paid_at ?? null,
    });
  },

  /** Recalcula as faturas de todos os cartões numa competência. */
  async syncAllInvoices(competence: YearMonth): Promise<void> {
    const cards = await creditCardRepository.listActive();
    for (const card of cards) {
      await this.syncInvoice(card.id, competence);
    }
  },

  /**
   * Alinha months.reserved_invoices com o total das faturas em aberto da
   * competência do mês, recalculando o disponível.
   */
  async syncMonthReservedInvoices(month: Month): Promise<Month> {
    const openTotal = await cardInvoiceRepository.openTotalByCompetence(
      month.year,
      month.month
    );
    return monthRepository.update(
      month.id,
      applyInvoicesTotalChange(month, openTotal)
    );
  },

  /** Recalcula faturas e reserva do mês numa tacada — usado após qualquer mudança. */
  async refresh(month: Month): Promise<Month> {
    await this.syncAllInvoices({ year: month.year, month: month.month });
    return this.syncMonthReservedInvoices(month);
  },

  /**
   * Cria uma compra no cartão e materializa suas parcelas.
   * O resíduo do arredondamento vai na última parcela (ver splitInstallments).
   */
  async createPurchase(
    input: CreatePurchaseInput,
    month: Month | null
  ): Promise<void> {
    const purchase = await cardPurchaseRepository.create({
      card_id: input.cardId,
      category_id: input.categoryId ?? null,
      description: input.description,
      total_amount: input.totalAmount,
      installments_count: input.installmentsCount,
      purchase_date: input.purchaseDate,
      first_charge_year: input.firstCharge.year,
      first_charge_month: input.firstCharge.month,
    });

    const amounts = splitInstallments(input.totalAmount, input.installmentsCount);
    const competences = installmentCompetences(
      input.firstCharge.year,
      input.firstCharge.month,
      input.installmentsCount
    );

    await cardInstallmentRepository.createMany(
      competences.map((c, i) => ({
        purchase_id: purchase.id,
        installment_no: i + 1,
        year: c.year,
        month: c.month,
        amount: amounts[i],
      }))
    );

    if (month) await this.refresh(month);
  },

  async removePurchase(purchaseId: string, month: Month | null): Promise<void> {
    await cardPurchaseRepository.remove(purchaseId);
    if (month) await this.refresh(month);
  },

  async createSubscription(
    input: SubscriptionInsert,
    month: Month | null
  ): Promise<void> {
    await subscriptionRepository.create(input);
    if (month) await this.refresh(month);
  },

  async updateSubscription(
    id: string,
    patch: SubscriptionUpdate,
    month: Month | null
  ): Promise<void> {
    await subscriptionRepository.update(id, patch);
    if (month) await this.refresh(month);
  },

  async removeSubscription(id: string, month: Month | null): Promise<void> {
    await subscriptionRepository.remove(id);
    if (month) await this.refresh(month);
  },

  /**
   * Marca a fatura como paga: sai do banco E da reserva ao mesmo tempo,
   * então o disponível não muda — o dinheiro já estava comprometido.
   */
  async setInvoicePaid(
    invoice: CardInvoice,
    month: Month,
    paid: boolean
  ): Promise<void> {
    await cardInvoiceRepository.update(invoice.id, {
      paid,
      paid_at: paid ? new Date().toISOString() : null,
    });

    await monthRepository.update(
      month.id,
      applyInvoicePayment(month, Number(invoice.total), paid)
    );
  },
};
