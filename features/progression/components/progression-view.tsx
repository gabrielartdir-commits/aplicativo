"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDown, ArrowRight, ArrowUp, LineChart as LineIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Tabs } from "@/components/ui/tabs";
import { useCreditCards, useInvoiceHistory } from "@/hooks/use-cards";
import { round2 } from "@/lib/finance";
import { shortCompetenceLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils/format";

/** Paleta fixa por série, para a leitura não mudar entre os gráficos. */
const SERIES = {
  installments: { key: "parcelas", label: "Parcelas", color: "#38bdf8" },
  subscriptions: { key: "assinaturas", label: "Assinaturas", color: "#a78bfa" },
  others: { key: "outras", label: "Outras compras", color: "#fbbf24" },
} as const;

interface Point {
  competence: string;
  year: number;
  month: number;
  parcelas: number;
  assinaturas: number;
  outras: number;
  total: number;
}

type Mode = "composicao" | "cartoes";

function Delta({ from, to }: { from: number; to: number }) {
  const diff = round2(to - from);
  if (Math.abs(diff) < 0.01) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <ArrowRight className="size-3" />
        estável
      </span>
    );
  }
  const up = diff > 0;
  return (
    <span
      className={cn(
        "flex items-center gap-1 text-[11px] font-semibold",
        up ? "text-rose-400" : "text-emerald-400"
      )}
    >
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {up ? "+" : "−"}
      {formatCurrency(Math.abs(diff)).replace("R$", "").trim()}
    </span>
  );
}

export function ProgressionView() {
  const { data: invoices } = useInvoiceHistory();
  const { data: cards } = useCreditCards();
  const [mode, setMode] = useState<Mode>("composicao");

  /** Uma linha por competência, somando todos os cartões. */
  const series = useMemo<Point[]>(() => {
    const map = new Map<string, Point>();
    for (const inv of invoices ?? []) {
      const key = `${inv.year}-${String(inv.month).padStart(2, "0")}`;
      const entry = map.get(key) ?? {
        competence: shortCompetenceLabel({ year: inv.year, month: inv.month }),
        year: inv.year,
        month: inv.month,
        parcelas: 0,
        assinaturas: 0,
        outras: 0,
        total: 0,
      };

      const parcelas = Number(inv.installments_total);
      const assinaturas = Number(inv.subscriptions_total);
      const total = Number(inv.total);

      entry.parcelas += parcelas;
      entry.assinaturas += assinaturas;
      // O que o extrato tem além do que o app conhece.
      entry.outras += Math.max(0, round2(total - parcelas - assinaturas));
      entry.total += total;
      map.set(key, entry);
    }
    return [...map.values()]
      .sort((a, b) => a.year - b.year || a.month - b.month)
      .map((p) => ({
        ...p,
        parcelas: round2(p.parcelas),
        assinaturas: round2(p.assinaturas),
        outras: round2(p.outras),
        total: round2(p.total),
      }));
  }, [invoices]);

  /** Uma série por cartão, para comparar a evolução entre eles. */
  const byCard = useMemo(() => {
    const names = new Map<string, string>();
    const map = new Map<string, Record<string, number | string>>();
    for (const inv of invoices ?? []) {
      names.set(inv.card_id, inv.card.name);
      const key = `${inv.year}-${String(inv.month).padStart(2, "0")}`;
      const entry = map.get(key) ?? {
        competence: shortCompetenceLabel({ year: inv.year, month: inv.month }),
        _sort: inv.year * 100 + inv.month,
      };
      entry[inv.card.name] =
        (Number(entry[inv.card.name]) || 0) + Number(inv.total);
      map.set(key, entry);
    }
    return {
      rows: [...map.values()].sort(
        (a, b) => Number(a._sort) - Number(b._sort)
      ),
      cardNames: [...names.values()],
    };
  }, [invoices]);

  const cardColors = useMemo(() => {
    const palette = ["#38bdf8", "#a78bfa", "#fbbf24", "#34d399", "#f472b6"];
    return Object.fromEntries(
      byCard.cardNames.map((name, i) => [name, palette[i % palette.length]])
    );
  }, [byCard.cardNames]);

  const last = series[series.length - 1];
  const previous = series[series.length - 2];

  if (series.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Progressão"
          description="Como suas faturas evoluem mês a mês."
        />
        <EmptyState
          icon={LineIcon}
          title="Ainda sem histórico"
          description="Os gráficos aparecem a partir da primeira fatura registrada. Vire o mês para começar a acumular competências."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Progressão"
        description="Como suas faturas evoluem mês a mês."
      />

      {/* Variação contra o mês anterior */}
      {previous && last && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {[
            { label: "Total", from: previous.total, to: last.total },
            { label: "Parcelas", from: previous.parcelas, to: last.parcelas },
            {
              label: "Assinaturas",
              from: previous.assinaturas,
              to: last.assinaturas,
            },
            { label: "Outras", from: previous.outras, to: last.outras },
          ].map((row) => (
            <Card key={row.label}>
              <CardContent className="space-y-1 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {row.label}
                </p>
                <p className="text-base font-bold tabular-nums">
                  {formatCurrency(row.to)}
                </p>
                <Delta from={row.from} to={row.to} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Tabs<Mode>
        items={[
          { value: "composicao", label: "Composição" },
          { value: "cartoes", label: "Por cartão" },
        ]}
        value={mode}
        onValueChange={setMode}
      />

      <Card>
        <CardContent className="p-3 md:p-4">
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              {mode === "composicao" ? (
                <BarChart data={series} margin={{ left: -18, right: 8, top: 8 }}>
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
                    formatter={(v, name) => [formatCurrency(Number(v)), String(name)] as [string, string]}
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {Object.values(SERIES).map((s) => (
                    <Bar
                      key={s.key}
                      dataKey={s.key}
                      name={s.label}
                      stackId="a"
                      fill={s.color}
                      radius={s.key === "outras" ? [6, 6, 0, 0] : undefined}
                    />
                  ))}
                </BarChart>
              ) : (
                <AreaChart
                  data={byCard.rows}
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
                    formatter={(v, name) => [formatCurrency(Number(v)), String(name)] as [string, string]}
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {byCard.cardNames.map((name) => (
                    <Area
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stroke={cardColors[name]}
                      fill={cardColors[name]}
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                  ))}
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Tabela mês a mês */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="p-3 text-left font-bold">Mês</th>
                  <th className="p-3 text-right font-bold">Parcelas</th>
                  <th className="p-3 text-right font-bold">Assinaturas</th>
                  <th className="p-3 text-right font-bold">Outras</th>
                  <th className="p-3 text-right font-bold">Total</th>
                </tr>
              </thead>
              <tbody>
                {[...series].reverse().map((p) => (
                  <tr
                    key={`${p.year}-${p.month}`}
                    className="border-b border-border/20 last:border-0"
                  >
                    <td className="p-3 font-semibold">{p.competence}</td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {formatCurrency(p.parcelas)}
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {formatCurrency(p.assinaturas)}
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {formatCurrency(p.outras)}
                    </td>
                    <td className="p-3 text-right font-bold tabular-nums">
                      {formatCurrency(p.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {(cards ?? []).length > 0 && series.length === 1 && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Só uma competência registrada até agora. A comparação mês a mês
          aparece depois da primeira virada de mês em Gastos Fixos.
        </p>
      )}
    </div>
  );
}
