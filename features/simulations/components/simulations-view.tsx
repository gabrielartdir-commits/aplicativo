"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, CheckCircle2, Sparkles, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/layout/page-header";
import { useCurrentMonth } from "@/hooks/use-current-month";
import { useProjection } from "@/hooks/use-projection";
import { round2 } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { formatCurrency, parseCurrencyInput } from "@/utils/format";

const HORIZON = 6;

export function SimulationsView() {
  const { data: month } = useCurrentMonth();
  const [valueInput, setValueInput] = useState("");
  const [installmentsInput, setInstallmentsInput] = useState("1");

  const amount = useMemo(() => {
    const parsed = parseCurrencyInput(valueInput);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [valueInput]);

  const installments = useMemo(() => {
    const n = parseInt(installmentsInput, 10);
    return Number.isFinite(n) && n >= 1 ? Math.min(n, HORIZON * 4) : 1;
  }, [installmentsInput]);

  const { rows, variableAverage } = useProjection({
    amount,
    installments,
    horizon: HORIZON,
  });

  /** Meses em que a compra deixaria o mês no vermelho. */
  const negatives = rows.filter((r) => r.simulated < 0);
  const worst = rows.reduce(
    (min, r) => (r.simulated < min.simulated ? r : min),
    rows[0]
  );

  const verdict = useMemo(() => {
    if (amount === 0 || rows.length === 0) return null;
    if (negatives.length > 0) {
      return {
        tone: "danger" as const,
        icon: AlertTriangle,
        title: `Estoura em ${negatives.length} ${negatives.length === 1 ? "mês" : "meses"}`,
        text: `O pior mês fica em ${formatCurrency(worst.simulated)}. Parcelar em mais vezes ou adiar resolveria.`,
      };
    }
    const tightest = worst?.simulated ?? 0;
    if (tightest < variableAverage * 0.25) {
      return {
        tone: "warning" as const,
        icon: TrendingDown,
        title: "Cabe, mas aperta",
        text: `Sobra ${formatCurrency(tightest)} no mês mais apertado — pouca folga para imprevistos.`,
      };
    }
    return {
      tone: "ok" as const,
      icon: CheckCircle2,
      title: "Cabe com folga",
      text: `Mesmo no mês mais apertado sobram ${formatCurrency(tightest)}.`,
    };
  }, [amount, rows.length, negatives.length, worst, variableAverage]);

  const chartData = rows.map((r) => ({
    competence: r.competence,
    Comprometido: round2(r.fixed + r.installments + r.subscriptions + r.variable),
    "Sobra hoje": r.baseline,
    "Sobra com a compra": r.simulated,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Simulações"
        description="Como um gasto afeta os próximos meses."
      />

      <Card>
        <CardContent className="space-y-4 p-4 md:p-5">
          <div className="grid grid-cols-[1fr_100px] gap-3">
            <div className="space-y-2">
              <Label htmlFor="sim-value">Valor da compra</Label>
              <Input
                id="sim-value"
                inputMode="decimal"
                placeholder="1.500,00"
                value={valueInput}
                onChange={(e) => setValueInput(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sim-inst">Parcelas</Label>
              <Input
                id="sim-inst"
                type="number"
                min="1"
                value={installmentsInput}
                onChange={(e) => setInstallmentsInput(e.target.value)}
              />
            </div>
          </div>

          {amount > 0 && installments > 1 && (
            <p className="text-xs text-muted-foreground">
              {installments}x de{" "}
              <span className="font-semibold text-foreground">
                {formatCurrency(round2(amount / installments))}
              </span>
            </p>
          )}

          {verdict && (
            <div
              className={cn(
                "flex items-start gap-3 rounded-[14px] border p-3.5",
                verdict.tone === "danger" &&
                  "border-rose-500/20 bg-rose-500/5 text-rose-400",
                verdict.tone === "warning" &&
                  "border-amber-500/20 bg-amber-500/5 text-amber-400",
                verdict.tone === "ok" &&
                  "border-primary/20 bg-primary/5 text-primary"
              )}
            >
              <verdict.icon className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-bold">{verdict.title}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {verdict.text}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardContent className="space-y-3 p-3 md:p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h2 className="text-sm font-semibold">
                Projeção dos próximos {HORIZON} meses
              </h2>
            </div>

            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ left: -18, right: 8, top: 8 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="currentColor"
                    className="text-border/30"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="competence"
                    tick={{ fontSize: 10 }}
                    stroke="currentColor"
                    className="text-muted-foreground"
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    stroke="currentColor"
                    className="text-muted-foreground"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `${Math.round(v / 100) / 10}k`}
                  />
                  <Tooltip
                    formatter={(v, name) =>
                      [formatCurrency(Number(v)), String(name)] as [string, string]
                    }
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine y={0} stroke="#f43f5e" strokeDasharray="4 4" />
                  <Bar
                    dataKey="Comprometido"
                    fill="#64748b"
                    fillOpacity={0.35}
                    radius={[6, 6, 0, 0]}
                  />
                  <Line
                    type="monotone"
                    dataKey="Sobra hoje"
                    stroke="#94a3b8"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="Sobra com a compra"
                    stroke={negatives.length > 0 ? "#f43f5e" : "#34d399"}
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              A projeção usa o salário de {formatCurrency(Number(month?.salary ?? 0))}
              , seus gastos fixos, as parcelas já comprometidas, as assinaturas e
              uma média de {formatCurrency(variableAverage)} em gastos variáveis
              por mês. Não considera receitas extras nem mudanças de salário.
            </p>
          </CardContent>
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="p-3 text-left font-bold">Mês</th>
                    <th className="p-3 text-right font-bold">Fixos</th>
                    <th className="p-3 text-right font-bold">Parcelas</th>
                    <th className="p-3 text-right font-bold">Variáveis</th>
                    <th className="p-3 text-right font-bold">Sobra</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={`${r.year}-${r.month}`}
                      className="border-b border-border/20 last:border-0"
                    >
                      <td className="p-3 font-semibold">
                        {r.competence}
                        {r.impact > 0 && (
                          <span className="ml-1.5 text-[9px] text-primary">
                            +{formatCurrency(r.impact)}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right tabular-nums text-muted-foreground">
                        {formatCurrency(r.fixed)}
                      </td>
                      <td className="p-3 text-right tabular-nums text-muted-foreground">
                        {formatCurrency(r.installments)}
                      </td>
                      <td className="p-3 text-right tabular-nums text-muted-foreground">
                        {formatCurrency(r.variable)}
                      </td>
                      <td
                        className={cn(
                          "p-3 text-right font-bold tabular-nums",
                          r.simulated < 0 ? "text-rose-400" : "text-foreground"
                        )}
                      >
                        {formatCurrency(r.simulated)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
