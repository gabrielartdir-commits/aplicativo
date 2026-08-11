"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";
import { incomeService } from "@/services/income-service";
import { recurringIncomeRepository } from "@/services/repositories/recurring-income-repository";
import { useCurrentMonth } from "./use-current-month";

export function useRecurringIncomes() {
  return useQuery({
    queryKey: queryKeys.recurringIncomes,
    queryFn: () => recurringIncomeRepository.list(),
  });
}

export function useRecurringIncomeMutations() {
  const queryClient = useQueryClient();
  const { data: month } = useCurrentMonth();

  /** Mudar uma entrada mexe no saldo do mês: invalida tudo que o exibe. */
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.recurringIncomes });
    queryClient.invalidateQueries({ queryKey: queryKeys.currentMonth });
  };

  const create = useMutation({
    mutationFn: (input: { name: string; amount: number; sort_order?: number }) =>
      incomeService.create(input, month ?? null),
    onSuccess: () => {
      invalidate();
      toast.success("Entrada adicionada.");
    },
    onError: (error) => toast.error(error.message),
  });

  const update = useMutation({
    mutationFn: ({
      id,
      ...patch
    }: {
      id: string;
      name?: string;
      amount?: number;
      active?: boolean;
    }) => incomeService.update(id, patch, month ?? null),
    onSuccess: invalidate,
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => incomeService.remove(id, month ?? null),
    onSuccess: () => {
      invalidate();
      toast.success("Entrada removida.");
    },
    onError: (error) => toast.error(error.message),
  });

  return { create, update, remove };
}
