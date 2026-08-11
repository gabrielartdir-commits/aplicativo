"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { round2 } from "@/lib/finance";
import { queryKeys } from "@/lib/query-keys";
import { investmentRepository } from "@/services/repositories/investment-repository";

const RESERVES_KEY = "budgetos.investment-reserves";

interface StoredReserve {
  current?: number;
}

/**
 * Total acumulado em investimentos — a mesma conta em toda tela que o exibe.
 *
 * Considera os aportes registrados no banco e as reservas mantidas no
 * navegador, ficando com o maior dos dois. São formas paralelas de registrar
 * o mesmo patrimônio: somá-las contaria o dinheiro duas vezes para quem usa
 * as duas, e ignorar uma zeraria o total de quem usa só aquela.
 */
export function useTotalInvested(): { total: number; isLoading: boolean } {
  const { data: investments, isLoading } = useQuery({
    queryKey: queryKeys.investments,
    queryFn: () => investmentRepository.listAll(),
  });

  /*
   * As reservas vivem no localStorage, que não existe no servidor. Ler depois
   * da montagem mantém o HTML do servidor igual ao do cliente na primeira
   * renderização, evitando erro de hidratação.
   */
  const [localTotal, setLocalTotal] = useState(0);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RESERVES_KEY);
      if (!raw) return;
      const parsed: StoredReserve[] = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      setLocalTotal(
        parsed.reduce((sum, reserve) => sum + Number(reserve.current ?? 0), 0)
      );
    } catch {
      // localStorage corrompido não deve derrubar a tela.
    }
  }, []);

  const total = useMemo(() => {
    const dbTotal = (investments ?? []).reduce(
      (sum, inv) => sum + Number(inv.amount),
      0
    );
    return round2(Math.max(dbTotal, localTotal));
  }, [investments, localTotal]);

  return { total, isLoading };
}
