"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { forecastRepository } from "@/services/repositories/forecast-repository";

/** Totais por competência e por grupo — base dos gráficos. */
export function useForecastSummary() {
  return useQuery({
    queryKey: queryKeys.forecastSummary,
    queryFn: () => forecastRepository.summary(),
  });
}

/** Todos os lançamentos previstos, para abrir o mês na tabela. */
export function useForecastEntries() {
  return useQuery({
    queryKey: queryKeys.forecastEntries,
    queryFn: () => forecastRepository.list(),
  });
}

/**
 * Apagar previsão. As duas chaves são invalidadas juntas — a tela mostra
 * resumo e lançamentos ao mesmo tempo, e meio atualizado confunde mais do que
 * esperar as duas.
 */
export function useForecastMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.forecastSummary });
    queryClient.invalidateQueries({ queryKey: queryKeys.forecastEntries });
  };

  const removeCompetence = useMutation({
    mutationFn: ({ year, month }: { year: number; month: number }) =>
      forecastRepository.removeCompetence(year, month),
    onSuccess: invalidate,
  });

  const clear = useMutation({
    mutationFn: () => forecastRepository.clear(),
    onSuccess: invalidate,
  });

  return { removeCompetence, clear, invalidate };
}
