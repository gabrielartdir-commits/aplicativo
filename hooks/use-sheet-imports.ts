"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { sheetRepository } from "@/services/repositories/sheet-repository";

/** Últimas planilhas importadas, para a tela de Configurações mostrar. */
export function useSheetImports() {
  return useQuery({
    queryKey: queryKeys.sheetImports,
    queryFn: () => sheetRepository.imports(),
  });
}
