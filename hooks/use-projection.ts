"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { round2 } from "@/lib/finance";
import { nextYearMonth, shortCompetenceLabel } from "@/lib/dates";
import { queryKeys } from "@/lib/query-keys";
import { transactionRepository } from "@/services/repositories/transaction-repository";
import { monthRepository } from "@/services/repositories/month-repository";
import { useCurrentMonth } from "./use-current-month";
import { useFixedExpenses } from "./use-fixed-expenses";
import { useUpcomingInstallments, useSubscriptions } from "./use-cards";

export interface ProjectionMonth {
  competence: string;
  year: number;
  month: number;
  /** Entradas previstas: salário recorrente. */
  income: number;
  fixed: number;
  installments: number;
  subscriptions: number;
  /** Média histórica de gastos variáveis. */
  variable: number;
  /** Sobra depois de tudo, sem contar a simulação. */
  baseline: number;
  /** Sobra considerando a compra simulada. */
  simulated: number;
  /** Parcela da compra simulada que cai neste mês. */
  impact: number;
}

/** Média de gastos variáveis dos meses já registrados. */
function useVariableAverage() {
  return useQuery({
    queryKey: queryKeys.variableAverage,
    queryFn: async () => {
      const [spend, months] = await Promise.all([
        transactionRepository.variableSpendByMonth(),
        monthRepository.list(),
      ]);
      if (months.length === 0 || spend.length === 0) return 0;

      // Só meses que já tiveram algum gasto entram na média — meses vazios
      // puxariam a média para baixo sem representar comportamento real.
      const totals = spend.map((s) => s.total);
      return round2(totals.reduce((a, b) => a + b, 0) / totals.length);
    },
  });
}

interface ProjectionInput {
  /** Valor total da compra simulada. */
  amount: number;
  /** Em quantas parcelas. 1 = à vista. */
  installments: number;
  /** Quantos meses projetar. */
  horizon?: number;
}

/**
 * Projeta os próximos meses considerando salário, gastos fixos, parcelas já
 * comprometidas, assinaturas e a média de gastos variáveis — com e sem a
 * compra simulada.
 */
export function useProjection({
  amount,
  installments,
  horizon = 6,
}: ProjectionInput) {
  const { data: month } = useCurrentMonth();
  const { data: expenses } = useFixedExpenses();
  const { data: upcoming } = useUpcomingInstallments(month?.year, month?.month);
  const { data: subscriptions } = useSubscriptions();
  const { data: variableAverage = 0 } = useVariableAverage();

  return useMemo<{ rows: ProjectionMonth[]; variableAverage: number }>(() => {
    if (!month) return { rows: [], variableAverage };

    const fixedTotal = (expenses ?? [])
      .filter((e) => e.active)
      .reduce((s, e) => s + Number(e.amount), 0);

    // Assinaturas no débito ficam fora de fatura; as de crédito já vêm nas
    // parcelas/faturas e não podem ser somadas de novo.
    const debitSubs = (subscriptions ?? [])
      .filter((s) => s.active && s.payment_method === "debit")
      .reduce((s, x) => s + Number(x.amount), 0);
    const creditSubs = (subscriptions ?? [])
      .filter((s) => s.active && s.payment_method === "credit")
      .reduce((s, x) => s + Number(x.amount), 0);

    const income = Number(month.salary);
    const perInstallment = installments > 0 ? amount / installments : 0;

    const rows: ProjectionMonth[] = [];
    let competence = { year: month.year, month: month.month };

    for (let i = 0; i < horizon; i++) {
      const installmentsDue = (upcoming ?? [])
        .filter((x) => x.year === competence.year && x.month === competence.month)
        .reduce((s, x) => s + Number(x.amount), 0);

      const impact = i < installments ? round2(perInstallment) : 0;

      const committed = round2(
        fixedTotal + installmentsDue + creditSubs + debitSubs + variableAverage
      );
      const baseline = round2(income - committed);

      rows.push({
        competence: shortCompetenceLabel(competence),
        year: competence.year,
        month: competence.month,
        income,
        fixed: round2(fixedTotal),
        installments: round2(installmentsDue),
        subscriptions: round2(creditSubs + debitSubs),
        variable: variableAverage,
        baseline,
        simulated: round2(baseline - impact),
        impact,
      });

      competence = nextYearMonth(competence);
    }

    return { rows, variableAverage };
  }, [
    month,
    expenses,
    upcoming,
    subscriptions,
    variableAverage,
    amount,
    installments,
    horizon,
  ]);
}
