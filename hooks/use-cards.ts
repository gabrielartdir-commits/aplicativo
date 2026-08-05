"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { creditCardRepository } from "@/services/repositories/credit-card-repository";
import { cardPurchaseRepository } from "@/services/repositories/card-purchase-repository";
import { cardInstallmentRepository } from "@/services/repositories/card-installment-repository";
import { subscriptionRepository } from "@/services/repositories/subscription-repository";
import { cardInvoiceRepository } from "@/services/repositories/card-invoice-repository";

export function useCreditCards() {
  return useQuery({
    queryKey: queryKeys.creditCards,
    queryFn: () => creditCardRepository.list(),
  });
}

export function useCardPurchases() {
  return useQuery({
    queryKey: queryKeys.cardPurchases,
    queryFn: () => cardPurchaseRepository.listWithInstallments(),
  });
}

/** Parcelas da competência atual. */
export function useInstallments(year?: number, month?: number) {
  return useQuery({
    queryKey: queryKeys.installments(year ?? 0, month ?? 0),
    queryFn: () => cardInstallmentRepository.listByCompetence(year!, month!),
    enabled: Boolean(year && month),
  });
}

/** Parcelas desta competência em diante — alimenta o calendário. */
export function useUpcomingInstallments(year?: number, month?: number) {
  return useQuery({
    queryKey: queryKeys.upcomingInstallments(year ?? 0, month ?? 0),
    queryFn: () => cardInstallmentRepository.listUpcoming(year!, month!),
    enabled: Boolean(year && month),
  });
}

export function useSubscriptions() {
  return useQuery({
    queryKey: queryKeys.subscriptions,
    queryFn: () => subscriptionRepository.list(),
  });
}

export function useInvoices(year?: number, month?: number) {
  return useQuery({
    queryKey: queryKeys.invoices(year ?? 0, month ?? 0),
    queryFn: () => cardInvoiceRepository.listByCompetence(year!, month!),
    enabled: Boolean(year && month),
  });
}
