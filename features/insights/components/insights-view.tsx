"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Lightbulb, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { useCurrentMonth } from "@/hooks/use-current-month";
import { useCommitments } from "@/hooks/use-commitments";
import { useProjection } from "@/hooks/use-projection";
import { useCardPurchases, useSubscriptions } from "@/hooks/use-cards";
import { useFixedExpenses } from "@/hooks/use-fixed-expenses";
import { monthLabel } from "@/lib/dates";
import { formatCurrency } from "@/utils/format";
import { Markdown } from "./markdown";

export function InsightsView() {
  const { data: month } = useCurrentMonth();
  const { data: commitments } = useCommitments();
  const { data: expenses } = useFixedExpenses();
  const { data: purchases } = useCardPurchases();
  const { data: subscriptions } = useSubscriptions();
  const { rows, variableAverage } = useProjection({
    amount: 0,
    installments: 1,
    horizon: 6,
  });
  const [analysis, setAnalysis] = useState<string | null>(null);

  /** Retrato do orçamento enviado à IA — só números, sem dados de identificação. */
  const context = useMemo(() => {
    if (!month) return null;
    return {
      mes: monthLabel(month),
      salario: Number(month.salary),
      entradas_extras: Number(month.extra_income),
      saldo_bancario: Number(month.bank_balance),
      disponivel_para_gastar: Number(month.available_balance),
      reservado: {
        gastos_fixos: commitments.fixedTotal,
        faturas_cartao: commitments.invoicesTotal,
        investimento: Number(month.reserved_investment),
      },
      composicao_faturas: {
        parcelas: commitments.installmentsInInvoices,
        assinaturas_credito: commitments.subscriptionsInInvoices,
        outras_compras: commitments.otherPurchases,
      },
      assinaturas_debito: commitments.debitSubscriptions,
      media_gastos_variaveis: variableAverage,
      contas_fixas: (expenses ?? [])
        .filter((e) => e.active)
        .map((e) => ({ nome: e.name, valor: Number(e.amount), dia: e.due_day })),
      assinaturas: (subscriptions ?? [])
        .filter((s) => s.active)
        .map((s) => ({
          nome: s.name,
          valor: Number(s.amount),
          forma: s.payment_method,
        })),
      compras_parceladas: (purchases ?? []).map((p) => ({
        descricao: p.description,
        total: Number(p.total_amount),
        parcelas: p.installments_count,
        parcelas_restantes: p.installments.length,
      })),
      projecao_proximos_meses: rows.map((r) => ({
        mes: r.competence,
        comprometido: r.fixed + r.installments + r.subscriptions,
        sobra_estimada: r.baseline,
      })),
    };
  }, [month, commitments, expenses, subscriptions, purchases, rows, variableAverage]);

  const analyze = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao analisar.");
      return data.reply as string;
    },
    onSuccess: setAnalysis,
  });

  if (!month) {
    return (
      <div className="space-y-6">
        <PageHeader title="Insights" description="Análise do seu orçamento." />
        <EmptyState
          icon={Lightbulb}
          title="Nenhum mês aberto"
          description="Abra um mês para o copiloto ter o que analisar."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Insights"
        description="Análise do copiloto sobre o mês atual e os próximos."
      />

      {/* Números que alimentam a análise */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          { label: "Disponível", value: Number(month.available_balance) },
          { label: "Comprometido", value: commitments.total },
          { label: "Média variável", value: variableAverage },
          {
            label: "Sobra projetada",
            value: rows[rows.length - 1]?.baseline ?? 0,
          },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="space-y-1 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {s.label}
              </p>
              <p className="text-base font-bold tabular-nums">
                {formatCurrency(s.value)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-4 p-4 md:p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="size-4" />
              </span>
              <h2 className="text-sm font-semibold">Análise do copiloto</h2>
            </div>
            <Button
              size="sm"
              variant={analysis ? "outline" : "default"}
              onClick={() => analyze.mutate()}
              disabled={analyze.isPending || !context}
            >
              {analyze.isPending ? (
                <>
                  <RefreshCw className="animate-spin" />
                  Analisando…
                </>
              ) : (
                <>
                  <Sparkles />
                  {analysis ? "Analisar de novo" : "Analisar meu mês"}
                </>
              )}
            </Button>
          </div>

          {analyze.isError && (
            <div className="flex items-start gap-2 rounded-[12px] border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>{analyze.error.message}</span>
            </div>
          )}

          {analysis ? (
            <Markdown content={analysis} />
          ) : (
            !analyze.isPending && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                O copiloto lê seus gastos fixos, faturas, parcelas e a média de
                gastos variáveis para apontar o que merece atenção agora e como
                se programar nos próximos meses.
              </p>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}
