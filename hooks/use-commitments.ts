"use client";

import { useMemo } from "react";
import { round2 } from "@/lib/finance";
import { useCurrentMonth } from "./use-current-month";
import { useFixedExpenses } from "./use-fixed-expenses";
import { usePayments } from "./use-payments";
import { useInstallments, useInvoices, useSubscriptions } from "./use-cards";

export interface Commitments {
  /** Contas fixas ativas do mês (aluguel, luz, boletos). */
  fixedTotal: number;
  fixedPaid: number;
  fixedPending: number;
  fixedCount: number;

  /** Faturas de cartão da competência. */
  invoicesTotal: number;
  invoicesOpen: number;
  invoicesPaid: number;
  invoicesCount: number;

  /** Composição das faturas — as partes já estão dentro de invoicesTotal. */
  installmentsInInvoices: number;
  subscriptionsInInvoices: number;
  otherPurchases: number;

  /** Assinaturas cobradas em débito: ficam fora de qualquer fatura. */
  debitSubscriptions: number;
  debitSubscriptionsCount: number;
  creditSubscriptionsCount: number;

  /**
   * Tudo que o mês já tem dono.
   *
   * Soma contas fixas + faturas + assinaturas no débito. Parcelas e
   * assinaturas no crédito NÃO entram por fora: já estão dentro das faturas,
   * e somá-las de novo dobraria o mesmo compromisso.
   */
  total: number;
}

/**
 * Consolida tudo que compromete o mês, numa conta só e sem duplicidade.
 */
export function useCommitments(): { data: Commitments; isLoading: boolean } {
  const { data: month } = useCurrentMonth();
  const { data: expenses } = useFixedExpenses();
  const { data: payments } = usePayments(month?.id);
  const { data: invoices } = useInvoices(month?.year, month?.month);
  const { data: installments } = useInstallments(month?.year, month?.month);
  const { data: subscriptions } = useSubscriptions();

  const data = useMemo<Commitments>(() => {
    const paidIds = new Set((payments ?? []).map((p) => p.fixed_expense_id));
    const activeFixed = (expenses ?? []).filter((e) => e.active);

    const fixedPaid = activeFixed
      .filter((e) => paidIds.has(e.id))
      .reduce((s, e) => s + Number(e.amount), 0);
    const fixedPending = activeFixed
      .filter((e) => !paidIds.has(e.id))
      .reduce((s, e) => s + Number(e.amount), 0);

    const list = invoices ?? [];
    const invoicesTotal = list.reduce((s, i) => s + Number(i.total), 0);
    const invoicesOpen = list
      .filter((i) => !i.paid)
      .reduce((s, i) => s + Number(i.total), 0);

    const installmentsInInvoices = (installments ?? []).reduce(
      (s, i) => s + Number(i.amount),
      0
    );
    const subscriptionsInInvoices = list.reduce(
      (s, i) => s + Number(i.subscriptions_total),
      0
    );

    const activeSubs = (subscriptions ?? []).filter((s) => s.active);
    const debit = activeSubs.filter((s) => s.payment_method === "debit");
    const debitSubscriptions = debit.reduce((s, x) => s + Number(x.amount), 0);

    return {
      fixedTotal: round2(fixedPaid + fixedPending),
      fixedPaid: round2(fixedPaid),
      fixedPending: round2(fixedPending),
      fixedCount: activeFixed.length,

      invoicesTotal: round2(invoicesTotal),
      invoicesOpen: round2(invoicesOpen),
      invoicesPaid: round2(invoicesTotal - invoicesOpen),
      invoicesCount: list.length,

      installmentsInInvoices: round2(installmentsInInvoices),
      subscriptionsInInvoices: round2(subscriptionsInInvoices),
      // O que o extrato tem além do que o app conhece.
      otherPurchases: round2(
        invoicesTotal - installmentsInInvoices - subscriptionsInInvoices
      ),

      debitSubscriptions: round2(debitSubscriptions),
      debitSubscriptionsCount: debit.length,
      creditSubscriptionsCount: activeSubs.length - debit.length,

      total: round2(fixedPaid + fixedPending + invoicesTotal + debitSubscriptions),
    };
  }, [expenses, payments, invoices, installments, subscriptions]);

  return { data, isLoading: !month };
}
