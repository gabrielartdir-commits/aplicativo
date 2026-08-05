"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";
import { cardService, type CreatePurchaseInput } from "@/services/card-service";
import { creditCardRepository } from "@/services/repositories/credit-card-repository";
import { useCurrentMonth } from "./use-current-month";
import type { Database } from "@/types/database";
import type { CardInvoice } from "@/types/domain";

type CreditCardInsert = Database["public"]["Tables"]["credit_cards"]["Insert"];
type CreditCardUpdate = Database["public"]["Tables"]["credit_cards"]["Update"];
type SubscriptionInsert =
  Database["public"]["Tables"]["subscriptions"]["Insert"];
type SubscriptionUpdate =
  Database["public"]["Tables"]["subscriptions"]["Update"];

/**
 * Qualquer mudança em cartão, parcela ou assinatura repercute na fatura e no
 * disponível do mês — por isso todas as mutações invalidam o mesmo conjunto.
 */
function useInvalidateCards() {
  const queryClient = useQueryClient();
  const { data: month } = useCurrentMonth();

  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.creditCards });
    queryClient.invalidateQueries({ queryKey: queryKeys.cardPurchases });
    queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions });
    queryClient.invalidateQueries({ queryKey: ["installments"] });
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
    queryClient.invalidateQueries({ queryKey: queryKeys.currentMonth });
    if (month) {
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets(month.id) });
    }
  };
}

export function useCreditCardMutations() {
  const invalidate = useInvalidateCards();
  const { data: month } = useCurrentMonth();

  const create = useMutation({
    mutationFn: (input: CreditCardInsert) => creditCardRepository.create(input),
    onSuccess: () => {
      invalidate();
      toast.success("Cartão adicionado.");
    },
    onError: (error) => toast.error(error.message),
  });

  const update = useMutation({
    mutationFn: ({ id, ...patch }: CreditCardUpdate & { id: string }) =>
      cardService.updateCard(id, patch, month ?? null),
    onSuccess: invalidate,
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => cardService.removeCard(id, month ?? null),
    onSuccess: () => {
      invalidate();
      toast.success("Cartão removido.");
    },
    onError: (error) => toast.error(error.message),
  });

  return { create, update, remove };
}

export function usePurchaseMutations() {
  const invalidate = useInvalidateCards();
  const { data: month } = useCurrentMonth();

  const create = useMutation({
    mutationFn: (input: CreatePurchaseInput) =>
      cardService.createPurchase(input, month ?? null),
    onSuccess: () => {
      invalidate();
      toast.success("Compra parcelada registrada.");
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => cardService.removePurchase(id, month ?? null),
    onSuccess: () => {
      invalidate();
      toast.success("Compra removida.");
    },
    onError: (error) => toast.error(error.message),
  });

  return { create, remove };
}

export function useSubscriptionMutations() {
  const invalidate = useInvalidateCards();
  const { data: month } = useCurrentMonth();

  const create = useMutation({
    mutationFn: (input: SubscriptionInsert) =>
      cardService.createSubscription(input, month ?? null),
    onSuccess: () => {
      invalidate();
      toast.success("Assinatura adicionada.");
    },
    onError: (error) => toast.error(error.message),
  });

  const update = useMutation({
    mutationFn: ({ id, ...patch }: SubscriptionUpdate & { id: string }) =>
      cardService.updateSubscription(id, patch, month ?? null),
    onSuccess: invalidate,
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      cardService.removeSubscription(id, month ?? null),
    onSuccess: () => {
      invalidate();
      toast.success("Assinatura removida.");
    },
    onError: (error) => toast.error(error.message),
  });

  return { create, update, remove };
}

export function useInvoiceMutations() {
  const invalidate = useInvalidateCards();
  const { data: month } = useCurrentMonth();

  const setPaid = useMutation({
    mutationFn: ({ invoice, paid }: { invoice: CardInvoice; paid: boolean }) => {
      if (!month) throw new Error("Nenhum mês aberto.");
      return cardService.setInvoicePaid(invoice, month, paid);
    },
    onSuccess: invalidate,
    onError: (error) => toast.error(error.message),
  });

  return { setPaid };
}
