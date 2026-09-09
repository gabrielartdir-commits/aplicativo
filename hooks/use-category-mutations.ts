"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";
import { budgetRepository } from "@/services/repositories/budget-repository";
import { categoryRepository } from "@/services/repositories/category-repository";
import { monthRepository } from "@/services/repositories/month-repository";
import type { Database } from "@/types/database";

type CategoryInsert = Database["public"]["Tables"]["categories"]["Insert"];
type CategoryUpdate = Database["public"]["Tables"]["categories"]["Update"];

export function useCategoryMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.categories });
    queryClient.invalidateQueries({ queryKey: queryKeys.currentMonth });
    queryClient.invalidateQueries({ queryKey: ["budgets"] });
  };

  const create = useMutation({
    mutationFn: (input: CategoryInsert) => categoryRepository.create(input),
    onSuccess: () => {
      invalidate();
      toast.success("Categoria criada.");
    },
    onError: (error) => toast.error(error.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: CategoryUpdate & { id: string }) => {
      const updated = await categoryRepository.update(id, patch);

      /*
       * Mudar o limite padrão precisa alcançar o mês corrente: `categories`
       * guarda o plano, mas quem o mês lê é `monthly_category_budgets`, que
       * recebeu uma cópia na abertura.
       */
      if (patch.default_limit !== undefined) {
        const month = await monthRepository.findLatestOpen();
        if (month) {
          const budget = await budgetRepository.findByMonthAndCategory(
            month.id,
            id
          );
          if (budget) {
            await budgetRepository.updateLimits(budget.id, patch.default_limit);
          }
        }
      }

      return updated;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Categoria atualizada.");
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => categoryRepository.remove(id),
    onSuccess: () => {
      invalidate();
      toast.success("Categoria removida.");
    },
    onError: (error) => toast.error(error.message),
  });

  return { create, update, remove };
}
