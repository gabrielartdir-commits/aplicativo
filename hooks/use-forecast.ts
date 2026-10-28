"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { forecastRepository } from "@/services/repositories/forecast-repository";

/**
 * A projeção dos próximos 12 meses.
 *
 * Depende de quase todo o cadastro do app, então não é cacheada por muito
 * tempo: mudar uma conta fixa tem de aparecer aqui na próxima visita.
 */
export function useForecastProjection() {
  return useQuery({
    queryKey: queryKeys.forecast,
    queryFn: () => forecastRepository.projection(),
    staleTime: 30_000,
  });
}
