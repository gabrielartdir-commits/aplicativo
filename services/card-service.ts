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
import {
  competenceForPurchase,
  invoiceDueDate,
  type YearMonth,
} from "@/lib/dates";
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
  /** Parcela em que a compra está hoje. 1 = compra nova. */
  currentInstallment?: number;
  purchaseDate: string;
}

export const cardService = {
  /**
   * Recalcula a fatura de um cartão numa competência a partir das parcelas e
   * das assinaturas, e devolve o total resultante.
   */
  async syncInvoice(
    cardId: string,
    competence: YearMonth
  ): Promise<CardInvoice | null> {
    const card = (await creditCardRepository.list()).find((c) => c.id === cardId);
    if (!card) throw new Error("Cartão não encontrado.");

    const existing = await cardInvoiceRepository.findByCardAndCompetence(
      cardId,
      competence.year,
      competence.month
    );

    // Fatura paga é histórico: o que foi cobrado já foi cobrado.
    if (existing?.paid) return existing;

    const installments = await cardInstallmentRepository.listByCardAndCompetence(
      cardId,
      competence.year,
      competence.month
    );
    const installmentsTotal = round2(
      installments.reduce((sum, i) => sum + Number(i.amount), 0)
    );

    const subscriptions =
      await subscriptionRepository.listActiveByCardForCompetence(
        cardId,
        competence.year,
        competence.month
      );
    const subscriptionsTotal = round2(
      subscriptions.reduce((sum, s) => sum + Number(s.amount), 0)
    );

    return cardInvoiceRepository.upsert({
      ...(existing ? { id: existing.id } : {}),
      card_id: cardId,
      year: competence.year,
      month: competence.month,
      installments_total: installmentsTotal,
      subscriptions_total: subscriptionsTotal,
      // Valor lido do extrato é entrada do usuário: recalcular a fatura
      // atualiza as partes conhecidas, nunca apaga o total informado.
      declared_total: existing?.declared_total ?? null,
      due_date: invoiceDueDate(competence, card.closing_day, card.due_day),
      paid: false,
      paid_at: null,
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
    const card = (await creditCardRepository.list()).find(
      (c) => c.id === input.cardId
    );
    if (!card) throw new Error("Cartão não encontrado.");

    const firstNo = Math.max(1, input.currentInstallment ?? 1);
    if (firstNo > input.installmentsCount) {
      throw new Error(
        "A parcela atual não pode ser maior que o total de parcelas."
      );
    }

    /*
     * Compra nova: a competência sai da data e do fechamento — comprou depois
     * do fechamento, cai na fatura seguinte.
     *
     * Compra já em andamento: a parcela informada é a que está vencendo agora,
     * então ela cai na competência do mês corrente. A data da compra é
     * passado que o app não viu.
     */
    const firstCharge =
      firstNo > 1 && month
        ? { year: month.year, month: month.month }
        : competenceForPurchase(input.purchaseDate, card.closing_day);

    const purchase = await cardPurchaseRepository.create({
      card_id: input.cardId,
      category_id: input.categoryId ?? null,
      description: input.description,
      total_amount: input.totalAmount,
      installments_count: input.installmentsCount,
      first_installment_no: firstNo,
      purchase_date: input.purchaseDate,
      first_charge_year: firstCharge.year,
      first_charge_month: firstCharge.month,
    });

    /*
     * O valor da parcela vem do total ORIGINAL dividido por TODAS as parcelas
     * — 1200 em 12x na parcela 5 gera parcelas de 100, não de 150. Só as
     * parcelas de firstNo em diante são materializadas; as anteriores saíram
     * de faturas que o app nunca viu.
     */
    const allAmounts = splitInstallments(
      input.totalAmount,
      input.installmentsCount
    );
    const remaining = allAmounts.slice(firstNo - 1);
    const competences = installmentCompetences(
      firstCharge.year,
      firstCharge.month,
      remaining.length
    );

    await cardInstallmentRepository.createMany(
      competences.map((c, i) => ({
        purchase_id: purchase.id,
        installment_no: firstNo + i,
        year: c.year,
        month: c.month,
        amount: remaining[i],
      }))
    );

    if (month) await this.refresh(month);
  },

  async removePurchase(purchaseId: string, month: Month | null): Promise<void> {
    await cardPurchaseRepository.remove(purchaseId);
    if (month) await this.refresh(month);
  },

  /**
   * Remover o cartão leva junto compras, parcelas e faturas (cascade), então a
   * reserva do mês precisa ser recalculada — senão sobra reserva sem fatura.
   */
  async removeCard(cardId: string, month: Month | null): Promise<void> {
    await creditCardRepository.remove(cardId);
    if (month) await this.refresh(month);
  },

  /** Criar o cartão já abre a fatura da competência, mesmo sem lançamentos. */
  async createCard(
    input: Database["public"]["Tables"]["credit_cards"]["Insert"],
    month: Month | null
  ): Promise<void> {
    await creditCardRepository.create(input);
    if (month) await this.refresh(month);
  },

  /** Alterar fechamento ou vencimento muda a data das faturas em aberto. */
  async updateCard(
    id: string,
    patch: Database["public"]["Tables"]["credit_cards"]["Update"],
    month: Month | null
  ): Promise<void> {
    await creditCardRepository.update(id, patch);
    if (month) await this.refresh(month);
  },

  /**
   * A assinatura passa a valer da competência atual em diante — nunca
   * retroage sobre faturas de meses já vividos.
   */
  async createSubscription(
    input: SubscriptionInsert,
    month: Month | null
  ): Promise<void> {
    await subscriptionRepository.create({
      ...input,
      start_year: input.start_year ?? month?.year ?? new Date().getFullYear(),
      start_month:
        input.start_month ?? month?.month ?? new Date().getMonth() + 1,
    });
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
   * Informa o total real da fatura, lido do extrato.
   *
   * O valor substitui a soma calculada — parcelas e assinaturas já estão
   * dentro dele. Passar `null` devolve a fatura ao valor calculado pelo app.
   * A reserva do mês é realinhada, já que o total mudou.
   */
  async setInvoiceDeclaredTotal(
    invoiceId: string,
    declaredTotal: number | null,
    month: Month
  ): Promise<void> {
    await cardInvoiceRepository.update(invoiceId, {
      declared_total: declaredTotal === null ? null : round2(declaredTotal),
    });
    await this.syncMonthReservedInvoices(month);
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
