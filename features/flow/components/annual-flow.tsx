"use client";

import { Fragment, useMemo, useState } from "react";
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
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  PiggyBank,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAnnualFlow } from "@/hooks/use-annual-flow";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/utils/format";
import type { FlowKind, FlowMonth, FlowMovement } from "@/types/flow";

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
const MONTH_SHORT = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

const KIND_LABEL: Record<FlowKind, string> = {
  salary: "Salário",
  extra: "Extra",
  income: "Receita",
  expense: "Gasto",
  fixed: "Conta fixa",
  invoice: "Fatura",
  adjustment: "Ajuste",
  investment: "Aporte",
};

function money(value: number) {
  return formatCurrency(value);
}

function signed(value: number) {
  const abs = formatCurrency(Math.abs(value)).replace("R$", "").trim();
  if (Math.abs(value) < 0.005) return abs;
  return `${value > 0 ? "+" : "−"}${abs}`;
}

function MovementRow({ movement }: { movement: FlowMovement }) {
  const inflow = movement.direction === "in";
  const aside = movement.direction === "aside";
  return (
    <div className="flex items-center gap-3 py-2">
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-[9px]",
          inflow && "bg-primary/10 text-primary",
          movement.direction === "out" && "bg-rose-500/10 text-rose-400",
          aside && "bg-sky-500/10 text-sky-400"
        )}
      >
        {inflow ? (
          <ArrowDownLeft className="size-3.5" />
        ) : aside ? (
          <PiggyBank className="size-3.5" />
        ) : (
          <ArrowUpRight className="size-3.5" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold">{movement.label}</p>
        <p className="truncate text-[10px] text-muted-foreground">
          {KIND_LABEL[movement.kind]}
          {movement.detail && movement.detail !== movement.label
            ? ` · ${movement.detail}`
            : ""}
          {" · "}
          {formatDate(`${movement.date}T00:00:00`)}
        </p>
      </div>
      <span
        className={cn(
          "shrink-0 text-xs font-bold tabular-nums",
          inflow && "text-primary",
          aside && "text-sky-400",
          movement.direction === "out" && "text-foreground/80"
        )}
      >
        {inflow ? "+" : aside ? "" : "−"}
        {formatCurrency(movement.amount).replace("R$", "").trim()}
      </span>
    </div>
  );
}

function MonthDetail({ month }: { month: FlowMonth }) {
  const b = month.breakdown;
  const parts = [
    { label: "Salário", value: b.salary, in: true },
    { label: "Extras", value: b.extra, in: true },
    { label: "Receitas", value: b.income, in: true },
    { label: "Ajustes +", value: b.adjustmentsIn, in: true },
    { label: "Gastos", value: b.expenses, in: false },
    { label: "Contas fixas", value: b.fixed, in: false },
    { label: "Faturas", value: b.invoices, in: false },
    { label: "Ajustes −", value: b.adjustmentsOut, in: false },
  ].filter((p) => p.value > 0);

  return (
    <div className="space-y-3 bg-accent/5 px-3 py-3">
      {parts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {parts.map((p) => (
            <span
              key={p.label}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] tabular-nums",
                p.in
                  ? "border-primary/20 text-primary"
                  : "border-rose-500/20 text-rose-400"
              )}
            >
              {p.label} {money(p.value)}
            </span>
          ))}
          {b.investments > 0 && (
            <span className="rounded-full border border-sky-500/20 px-2 py-0.5 text-[10px] tabular-nums text-sky-400">
              Aportes {money(b.investments)}
            </span>
          )}
        </div>
      )}

      {month.movements.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {month.opened
            ? "Nenhum movimento registrado neste mês."
            : "Este mês não foi aberto no app."}
        </p>
      ) : (
        <div className="divide-y divide-border/20">
          {month.movements.map((m) => (
            <MovementRow key={`${m.kind}-${m.id}`} movement={m} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Backlog do ano: entradas e saídas de cada mês, com o detalhe de cada um. */
export function AnnualFlow({ initialYear }: { initialYear: number }) {
  const [year, setYear] = useState(initialYear);
  const [expanded, setExpanded] = useState<number | null>(null);
  const { data, isLoading, isError, error } = useAnnualFlow(year);

  const chartData = useMemo(
    () =>
      (data?.months ?? []).map((m) => ({
        mes: MONTH_SHORT[m.month - 1],
        Entradas: m.inflow,
        Saídas: m.outflow,
        Resultado: m.net,
      })),
    [data]
  );

  const years = data?.availableYears ?? [year];
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const hasMovement = (data?.months ?? []).some(
    (m) => m.movements.length > 0
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">
            Backlog do ano
          </p>
          <p className="text-[10px] text-muted-foreground">
            Entradas e saídas de todos os meses · toque num mês para ver os
            movimentos
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Ano anterior"
            disabled={year <= minYear}
            onClick={() => {
              setYear((y) => y - 1);
              setExpanded(null);
            }}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="w-12 text-center text-sm font-bold tabular-nums">
            {year}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Próximo ano"
            disabled={year >= maxYear}
            onClick={() => {
              setYear((y) => y + 1);
              setExpanded(null);
            }}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {isError && (
        <p className="rounded-[12px] border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
          Não foi possível carregar o ano: {(error as Error).message}
        </p>
      )}

      {isLoading || !data ? (
        <p className="text-xs text-muted-foreground">Carregando o ano…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {[
              {
                label: "Entradas no ano",
                value: money(data.totals.inflow),
                tone: "text-primary",
              },
              {
                label: "Saídas no ano",
                value: money(data.totals.outflow),
                tone: "text-rose-400",
              },
              {
                label: "Resultado",
                value: money(data.totals.net),
                tone:
                  data.totals.net >= 0 ? "text-foreground" : "text-rose-400",
              },
              {
                label: "Aportes",
                value: money(data.totals.invested),
                tone: "text-sky-400",
              },
            ].map((card) => (
              <Card key={card.label}>
                <CardContent className="space-y-1 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {card.label}
                  </p>
                  <p
                    className={cn(
                      "text-base font-bold tabular-nums md:text-lg",
                      card.tone
                    )}
                  >
                    {card.value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {hasMovement && (
            <Card>
              <CardContent className="p-3 md:p-4">
                <div className="h-[240px] w-full">
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
                        dataKey="mes"
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
                        tickFormatter={(v: number) =>
                          `${Math.round(v / 100) / 10}k`
                        }
                      />
                      <Tooltip
                        formatter={(v, name) =>
                          [money(Number(v)), String(name)] as [string, string]
                        }
                        contentStyle={{
                          background: "var(--color-popover)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <ReferenceLine y={0} stroke="currentColor" className="text-border" />
                      <Bar
                        dataKey="Entradas"
                        fill="#34d399"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="Saídas"
                        fill="#fb7185"
                        radius={[4, 4, 0, 0]}
                      />
                      <Line
                        type="monotone"
                        dataKey="Resultado"
                        stroke="#e2e8f0"
                        strokeWidth={2}
                        dot={{ r: 2.5 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-xs">
                  <thead>
                    <tr className="border-b border-border/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="p-3 text-left font-bold">Mês</th>
                      <th className="p-3 text-right font-bold">Entradas</th>
                      <th className="p-3 text-right font-bold">Saídas</th>
                      <th className="p-3 text-right font-bold">Aportes</th>
                      <th className="p-3 text-right font-bold">Resultado</th>
                      <th className="p-3 text-right font-bold">Saldo final</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.months.map((m) => {
                      const open = expanded === m.month;
                      const empty = !m.opened && m.movements.length === 0;
                      return (
                        <Fragment key={m.month}>
                          <tr
                            onClick={() => setExpanded(open ? null : m.month)}
                            className={cn(
                              "cursor-pointer border-b border-border/20 transition-colors hover:bg-accent/10",
                              empty && "text-muted-foreground/60",
                              open && "bg-accent/10"
                            )}
                          >
                            <td className="p-3 font-semibold">
                              <span className="flex items-center gap-1.5">
                                <ChevronDown
                                  className={cn(
                                    "size-3.5 shrink-0 transition-transform",
                                    open ? "rotate-0" : "-rotate-90"
                                  )}
                                />
                                {MONTH_NAMES[m.month - 1]}
                                {m.closed && (
                                  <span className="rounded bg-accent/30 px-1 text-[9px] font-medium text-muted-foreground">
                                    fechado
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="p-3 text-right tabular-nums text-primary">
                              {empty ? "—" : money(m.inflow)}
                            </td>
                            <td className="p-3 text-right tabular-nums text-rose-400">
                              {empty ? "—" : money(m.outflow)}
                            </td>
                            <td className="p-3 text-right tabular-nums text-sky-400">
                              {empty || m.invested === 0 ? "—" : money(m.invested)}
                            </td>
                            <td
                              className={cn(
                                "p-3 text-right font-bold tabular-nums",
                                !empty && m.net < 0 && "text-rose-400"
                              )}
                            >
                              {empty ? "—" : signed(m.net)}
                            </td>
                            <td className="p-3 text-right tabular-nums text-muted-foreground">
                              {m.endingBalance === null
                                ? "—"
                                : money(m.endingBalance)}
                            </td>
                          </tr>
                          {open && (
                            <tr className="border-b border-border/20">
                              <td colSpan={6} className="p-0">
                                <MonthDetail month={m} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border/40 font-bold">
                      <td className="p-3">Total</td>
                      <td className="p-3 text-right tabular-nums text-primary">
                        {money(data.totals.inflow)}
                      </td>
                      <td className="p-3 text-right tabular-nums text-rose-400">
                        {money(data.totals.outflow)}
                      </td>
                      <td className="p-3 text-right tabular-nums text-sky-400">
                        {money(data.totals.invested)}
                      </td>
                      <td
                        className={cn(
                          "p-3 text-right tabular-nums",
                          data.totals.net < 0 && "text-rose-400"
                        )}
                      >
                        {signed(data.totals.net)}
                      </td>
                      <td className="p-3" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Saídas incluem gastos, contas fixas pagas e faturas pagas. Parcelas
            e assinaturas não aparecem soltas porque já estão dentro da fatura.
            Aportes ficam à parte: separam dinheiro para investir, sem sair do
            saldo bancário.
          </p>
        </>
      )}
    </div>
  );
}
