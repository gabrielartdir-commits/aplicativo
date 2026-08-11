"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";
import { adjustmentRepository } from "@/services/repositories/adjustment-repository";
import { balanceService } from "@/services/balance-service";
import { transactionService } from "@/services/transaction-service";
import type { BalanceAdjustment, TransactionWithCategory } from "@/types/domain";
import { useCurrentMonth } from "./use-current-month";
import { useTransactions } from "./use-transactions";

export type LedgerKind = "income" | "expense" | "investment" | "adjustment";

export interface LedgerEntry {
  id: string;
  kind: LedgerKind;
  label: string;
  detail: string | null;
  date: string;
  /** Positivo entra no saldo, negativo sai. */
  signedAmount: number;
  /** Origem do registro, para saber a que serviço pedir a remoção. */
  source: "transaction" | "adjustment";
}

/** Sinal do efeito de um ajuste sobre o saldo, espelhando adjustmentDelta. */
function adjustmentSign(type: BalanceAdjustment["type"], amount: number) {
  switch (type) {
    case "entry":
      return Math.abs(amount);
    case "exit":
    case "transfer":
      return -Math.abs(amount);
    case "correction":
      return amount;
  }
}

const ADJUSTMENT_LABEL: Record<BalanceAdjustment["type"], string> = {
  entry: "Entrada avulsa",
  exit: "Saída avulsa",
  correction: "Correção de saldo",
  transfer: "Transferência",
};

/**
 * Backlog do mês: todo movimento que alterou o saldo, em ordem cronológica.
 *
 * Junta transações e ajustes numa lista só porque, para conferir o extrato, o
 * que importa é o que entrou e o que saiu — não em qual tabela o registro mora.
 */
export function useLedger() {
  const { data: month } = useCurrentMonth();
  const { data: transactions } = useTransactions(month?.id);

  const { data: adjustments } = useQuery({
    queryKey: queryKeys.adjustments(month?.id ?? ""),
    queryFn: () => adjustmentRepository.listByMonth(month!.id),
    enabled: Boolean(month?.id),
  });

  const entries = useMemo<LedgerEntry[]>(() => {
    const fromTransactions = (transactions ?? []).map(
      (t: TransactionWithCategory): LedgerEntry => {
        const amount = Number(t.amount);
        const kind: LedgerKind =
          t.type === "income"
            ? "income"
            : t.type === "investment"
              ? "investment"
              : t.type === "adjustment"
                ? "adjustment"
                : "expense";
        return {
          id: t.id,
          kind,
          label: t.description || (kind === "income" ? "Receita" : "Lançamento"),
          detail: t.category?.name ?? null,
          date: t.date,
          // Aporte sai do disponível como um gasto, mesmo não sendo consumo.
          signedAmount: kind === "income" ? amount : -amount,
          source: "transaction",
        };
      }
    );

    const fromAdjustments = (adjustments ?? []).map(
      (a: BalanceAdjustment): LedgerEntry => ({
        id: a.id,
        kind: "adjustment",
        label: a.description || ADJUSTMENT_LABEL[a.type],
        detail: ADJUSTMENT_LABEL[a.type],
        date: a.created_at.slice(0, 10),
        signedAmount: adjustmentSign(a.type, Number(a.amount)),
        source: "adjustment",
      })
    );

    return [...fromTransactions, ...fromAdjustments].sort((a, b) =>
      b.date.localeCompare(a.date)
    );
  }, [transactions, adjustments]);

  const totals = useMemo(() => {
    const inflow = entries
      .filter((e) => e.signedAmount > 0)
      .reduce((s, e) => s + e.signedAmount, 0);
    const outflow = entries
      .filter((e) => e.signedAmount < 0)
      .reduce((s, e) => s + Math.abs(e.signedAmount), 0);
    return { inflow, outflow };
  }, [entries]);

  return { entries, totals, month };
}

/** Remove um lançamento do backlog, desfazendo o efeito dele no saldo. */
export function useLedgerMutations() {
  const queryClient = useQueryClient();
  const { data: month } = useCurrentMonth();

  const remove = useMutation({
    mutationFn: async (entry: LedgerEntry) => {
      if (!month) throw new Error("Nenhum mês aberto.");

      if (entry.source === "transaction") {
        await transactionService.deleteTransaction(entry.id);
        return;
      }

      const list = await adjustmentRepository.listByMonth(month.id);
      const adjustment = list.find((a) => a.id === entry.id);
      if (!adjustment) throw new Error("Ajuste não encontrado.");
      await balanceService.remove(adjustment, month);
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success("Lançamento removido.");
    },
    onError: (error) => toast.error(error.message),
  });

  return { remove };
}
