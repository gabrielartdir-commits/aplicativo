"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { flowRepository } from "@/services/repositories/flow-repository";

/**
 * Entradas e saídas de todos os meses de um ano.
 *
 * Sem cache longo de propósito: qualquer lançamento em qualquer tela muda
 * esses totais, então a consulta roda de novo sempre que a visão é aberta.
 */
export function useAnnualFlow(year: number) {
  return useQuery({
    queryKey: queryKeys.annualFlow(year),
    queryFn: () => flowRepository.annual(year),
    staleTime: 0,
  });
}
