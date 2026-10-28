"use client";

import { Fragment, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CalendarClock,
  ChevronDown,
  Download,
  Trash2,
  TrendingDown,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { useCurrentMonth } from "@/hooks/use-current-month";
import {
  useForecastEntries,
  useForecastMutations,
  useForecastSummary,
} from "@/hooks/use-forecast";
import { monthLabel } from "@/lib/dates";
import { round2 } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/utils/format";
import type { ForecastMonth, ForecastStatus } from "@/types/forecast";
import { ImportDialog } from "./import-dialog";

/** Paleta fixa por posição: o mesmo grupo mantém a cor entre os gráficos. */
const PALETTE = [
  "#38bdf8",
  "#a78bfa",
  "#fbbf24",
  "#fb7185",
  "#34d399",
  "#f472b6",
];
const OTHERS_COLOR = "#94a3b8";
const OTHERS_LABEL = "Outros";

/** Grupos desenhados à parte; o resto soma em "Outros". */
const MAX_GROUPS = PALETTE.length;

/**
 * As séries de grupo vão para o gráfico com o prefixo `g:`.
 *
 * Nome de grupo é texto livre da planilha: sem o prefixo, um grupo chamado
 * "Entradas" colidiria com a série de entradas e as duas virariam uma.
 */
const SERIES_PREFIX = "g:";

type Horizon = "6" | "12" | "tudo";

const STATUS_LABEL: Record<ForecastStatus, string> = {
  previsto: "previsto",
  confirmado: "confirmado",
  pago: "pago",
};

function competenceValue(year: number, month: number): number {
  return year * 12 + month;
}

function money(value: number): string {
  return formatCurrency(value);
}

/** Cartão de número do topo. */
function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "negative" | "positive";
}) {
  return (
    <Card size="sm">
      <CardContent className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p
          className={cn(
            "text-lg font-semibold tabular-nums",
            tone === "negative" && "text-rose-400",
            tone === "positive" && "text-emerald-400"
          )}
        >
          {value}
        </p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function ForecastView() {
  const { data: month } = useCurrentMonth();
  const { data: summary, isLoading } = useForecastSummary();
  const { data: entries } = useForecastEntries();
  const { removeCompetence } = useForecastMutations();

  const [horizon, setHorizon] = useState<Horizon>("12");
  const [importOpen, setImportOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Em useMemo porque o `?? []` cria um array novo a cada render, e ele é
  // dependência dos recortes abaixo.
  const months = useMemo(() => summary?.months ?? [], [summary]);

  /** A partir de qual competência a tela olha: o mês aberto no app. */
  const cut = useMemo(() => {
    const now = new Date();
    return competenceValue(
      month?.year ?? now.getFullYear(),
      month?.month ?? now.getMonth() + 1
    );
  }, [month]);

  const ahead = useMemo(
    () => months.filter((m) => competenceValue(m.year, m.month) >= cut),
    [months, cut]
  );

  const visible = useMemo<ForecastMonth[]>(() => {
    if (horizon === "tudo") return months;
    return ahead.slice(0, horizon === "6" ? 6 : 12);
  }, [horizon, months, ahead]);

  /** Grupos do recorte visível, do maior para o menor. */
  const groups = useMemo(() => {
    const totals = new Map<string, number>();
    for (const item of visible) {
      for (const [name, value] of Object.entries(item.groups)) {
        totals.set(name, round2((totals.get(name) ?? 0) + value));
      }
    }
    return [...totals.entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
  }, [visible]);

  const topGroups = useMemo(() => groups.slice(0, MAX_GROUPS), [groups]);
  const hasOthers = groups.length > MAX_GROUPS;

  const color = (index: number) => PALETTE[index % PALETTE.length];

  /** Uma linha por competência: grupos empilhados + entradas + saldo. */
  const chartData = useMemo(() => {
    const names = new Set(topGroups.map((g) => g.name));
    return visible.map((item) => {
      const row: Record<string, number | string> = {
        competence: item.competence,
        Entradas: item.entradas,
        Saídas: item.saidas,
        Saldo: item.saldo,
      };
      let others = 0;
      for (const [name, value] of Object.entries(item.groups)) {
        if (names.has(name)) row[`${SERIES_PREFIX}${name}`] = value;
        else others += value;
      }
      if (hasOthers) row[`${SERIES_PREFIX}${OTHERS_LABEL}`] = round2(others);
      return row;
    });
  }, [visible, topGroups, hasOthers]);

  /** Saídas somadas mês a mês — quanto o período inteiro custa. */
  const cumulative = useMemo(() => {
    let running = 0;
    return visible.map((item) => {
      running = round2(running + item.saidas);
      return {
        competence: item.competence,
        Acumulado: running,
        Mês: item.saidas,
      };
    });
  }, [visible]);

  const totals = useMemo(() => {
    const saidas = round2(visible.reduce((sum, m) => sum + m.saidas, 0));
    const entradas = round2(visible.reduce((sum, m) => sum + m.entradas, 0));
    const heaviest = visible.reduce<ForecastMonth | null>(
      (worst, m) => (!worst || m.saidas > worst.saidas ? m : worst),
      null
    );
    return {
      saidas,
      entradas,
      saldo: round2(entradas - saidas),
      average: visible.length > 0 ? round2(saidas / visible.length) : 0,
      heaviest,
      count: visible.reduce((sum, m) => sum + m.count, 0),
    };
  }, [visible]);

  const entriesByCompetence = useMemo(() => {
    const map = new Map<string, typeof entries>();
    for (const entry of entries ?? []) {
      const key = `${entry.year}-${entry.month}`;
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    return map;
  }, [entries]);

  function remove(item: ForecastMonth) {
    const label = monthLabel({ year: item.year, month: item.month });
    if (
      !window.confirm(
        `Apagar a previsão de ${label}? São ${item.count} linha(s). Isso não mexe em nada do resto do app — e você pode reimportar a planilha depois.`
      )
    ) {
      return;
    }
    removeCompetence.mutate(
      { year: item.year, month: item.month },
      {
        onSuccess: () => toast.success(`Previsão de ${label} apagada.`),
        onError: (error) => toast.error(error.message),
      }
    );
  }

  const header = (
    <PageHeader
      title="Próximos meses"
      description="Os gastos que você já sabe que vêm, vindos da sua planilha. Este espaço é só de visualização: não altera saldo, disponível, reservas nem faturas."
    >
      <Button size="sm" onClick={() => setImportOpen(true)}>
        <Upload className="size-4 mr-2" /> Importar planilha
      </Button>
    </PageHeader>
  );

  if (isLoading) {
    return (
      <div className="space-y-8">
        {header}
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Carregando a previsão…
          </CardContent>
        </Card>
      </div>
    );
  }

  if (months.length === 0) {
    return (
      <div className="space-y-8">
        {header}
        <EmptyState
          icon={CalendarClock}
          title="Nenhum mês previsto ainda"
          description="Baixe o modelo, preencha os meses que vêm e importe. O app soma por mês e desenha os gráficos — a planilha continua sendo sua fonte."
        />
        <div className="flex flex-wrap justify-center gap-2">
          <a
            href="/api/proximos-meses/modelo"
            download
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Download className="size-4 mr-2" /> Modelo em branco
          </a>
          <a
            href="/api/proximos-meses/modelo?preencher=1"
            download
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Download className="size-4 mr-2" /> Modelo já preenchido
          </a>
          <Button size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="size-4 mr-2" /> Importar planilha
          </Button>
        </div>
        <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      </div>
    );
  }

  const hasIncome = totals.entradas > 0;

  return (
    <div className="space-y-6">
      {header}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={horizon}
          onValueChange={setHorizon}
          items={[
            { value: "6", label: "6 meses", count: Math.min(ahead.length, 6) },
            { value: "12", label: "12 meses", count: Math.min(ahead.length, 12) },
            { value: "tudo", label: "Tudo", count: months.length },
          ]}
        />
        {summary?.last && (
          <p className="text-[11px] text-muted-foreground">
            Última importação: {summary.last.filename || "planilha"} ·{" "}
            {formatDate(summary.last.imported_at)} ·{" "}
            {summary.last.entries_count} linhas
          </p>
        )}
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            A planilha importada não tem nenhum mês a partir de{" "}
            {monthLabel({
              year: month?.year ?? new Date().getFullYear(),
              month: month?.month ?? new Date().getMonth() + 1,
            })}
            . Veja em <span className="font-medium">Tudo</span> o que já foi
            importado.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label={`Saídas · ${visible.length} ${visible.length === 1 ? "mês" : "meses"}`}
              value={money(totals.saidas)}
              hint={`${totals.count} lançamentos previstos`}
              tone="negative"
            />
            <Stat
              label="Média por mês"
              value={money(totals.average)}
              hint="saídas do período ÷ meses"
            />
            <Stat
              label="Mês mais pesado"
              value={
                totals.heaviest ? money(totals.heaviest.saidas) : money(0)
              }
              hint={
                totals.heaviest
                  ? monthLabel({
                      year: totals.heaviest.year,
                      month: totals.heaviest.month,
                    })
                  : undefined
              }
            />
            {hasIncome ? (
              <Stat
                label="Saldo previsto"
                value={money(totals.saldo)}
                hint={`entradas de ${money(totals.entradas)}`}
                tone={totals.saldo >= 0 ? "positive" : "negative"}
              />
            ) : (
              <Stat
                label="Grupos"
                value={String(groups.length)}
                hint={
                  groups[0]
                    ? `maior: ${groups[0].name} (${money(groups[0].total)})`
                    : undefined
                }
              />
            )}
          </div>

          {/* Gasto de cada mês, aberto por grupo */}
          <Card>
            <CardContent className="space-y-3 p-3 md:p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold">
                  Saídas por mês, abertas por grupo
                </p>
                {hasIncome && (
                  <span className="text-[11px] text-muted-foreground">
                    a linha é a entrada prevista
                  </span>
                )}
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
                    {topGroups.map((group, index) => (
                      <Bar
                        key={group.name}
                        dataKey={`${SERIES_PREFIX}${group.name}`}
                        name={group.name}
                        stackId="saidas"
                        fill={color(index)}
                      />
                    ))}
                    {hasOthers && (
                      <Bar
                        dataKey={`${SERIES_PREFIX}${OTHERS_LABEL}`}
                        name={OTHERS_LABEL}
                        stackId="saidas"
                        fill={OTHERS_COLOR}
                      />
                    )}
                    {hasIncome && (
                      <Line
                        type="monotone"
                        dataKey="Entradas"
                        stroke="#34d399"
                        strokeWidth={2}
                        dot={{ r: 2.5 }}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Quanto o período custa, somando mês a mês */}
            <Card>
              <CardContent className="space-y-3 p-3 md:p-4">
                <p className="text-xs font-semibold">Saídas acumuladas</p>
                <div className="h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={cumulative}
                      margin={{ left: -18, right: 8, top: 8 }}
                    >
                      <defs>
                        <linearGradient id="forecast-acc" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#fb7185" stopOpacity={0.45} />
                          <stop offset="100%" stopColor="#fb7185" stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
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
                      <Area
                        type="monotone"
                        dataKey="Acumulado"
                        stroke="#fb7185"
                        strokeWidth={2}
                        fill="url(#forecast-acc)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Quem come o dinheiro no período */}
            <Card>
              <CardContent className="space-y-3 p-3 md:p-4">
                <p className="text-xs font-semibold">
                  Total por grupo no período
                </p>
                <div
                  className="w-full"
                  style={{ height: Math.max(240, groups.length * 34) }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={groups}
                      layout="vertical"
                      margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="currentColor"
                        className="text-border/30"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 10 }}
                        stroke="currentColor"
                        className="text-muted-foreground"
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) =>
                          `${Math.round(v / 100) / 10}k`
                        }
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={110}
                        tick={{ fontSize: 10 }}
                        stroke="currentColor"
                        className="text-muted-foreground"
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        formatter={(v) =>
                          [money(Number(v)), "Total"] as [string, string]
                        }
                        contentStyle={{
                          background: "var(--color-popover)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                        {groups.map((group, index) => (
                          <Cell
                            key={group.name}
                            fill={
                              index < MAX_GROUPS ? color(index) : OTHERS_COLOR
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Mês a mês, com os lançamentos por dentro */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-xs">
                  <thead>
                    <tr className="border-b border-border/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="p-3 text-left font-bold">Mês</th>
                      <th className="p-3 text-right font-bold">Linhas</th>
                      <th className="p-3 text-right font-bold">Entradas</th>
                      <th className="p-3 text-right font-bold">Saídas</th>
                      <th className="p-3 text-right font-bold">Saldo</th>
                      <th className="p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((item) => {
                      const key = `${item.year}-${item.month}`;
                      const open = expanded === key;
                      const rows = entriesByCompetence.get(key) ?? [];
                      return (
                        <Fragment key={key}>
                          <tr
                            onClick={() => setExpanded(open ? null : key)}
                            className={cn(
                              "cursor-pointer border-b border-border/20 transition-colors hover:bg-accent/10",
                              open && "bg-accent/10"
                            )}
                          >
                            <td className="p-3 font-semibold">
                              <span className="flex items-center gap-1.5">
                                <ChevronDown
                                  className={cn(
                                    "size-3.5 text-muted-foreground transition-transform",
                                    open && "rotate-180"
                                  )}
                                />
                                {monthLabel({
                                  year: item.year,
                                  month: item.month,
                                })}
                              </span>
                            </td>
                            <td className="p-3 text-right tabular-nums text-muted-foreground">
                              {item.count}
                            </td>
                            <td className="p-3 text-right tabular-nums text-emerald-400">
                              {item.entradas > 0 ? money(item.entradas) : "—"}
                            </td>
                            <td className="p-3 text-right tabular-nums text-rose-400">
                              {money(item.saidas)}
                            </td>
                            <td
                              className={cn(
                                "p-3 text-right font-semibold tabular-nums",
                                item.entradas === 0
                                  ? "text-muted-foreground"
                                  : item.saldo >= 0
                                    ? "text-emerald-400"
                                    : "text-rose-400"
                              )}
                            >
                              {item.entradas > 0 ? money(item.saldo) : "—"}
                            </td>
                            <td className="p-3 text-right">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Apagar previsão de ${monthLabel({ year: item.year, month: item.month })}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  remove(item);
                                }}
                                disabled={removeCompetence.isPending}
                              >
                                <Trash2 className="size-3.5 text-muted-foreground" />
                              </Button>
                            </td>
                          </tr>

                          {open && (
                            <tr className="border-b border-border/20 bg-accent/5">
                              <td colSpan={6} className="p-0">
                                <div className="divide-y divide-border/20">
                                  {rows.length === 0 && (
                                    <p className="p-3 text-muted-foreground">
                                      Nenhum lançamento neste mês.
                                    </p>
                                  )}
                                  {rows.map((entry) => (
                                    <div
                                      key={entry.id}
                                      className="flex items-center gap-3 px-3 py-2"
                                    >
                                      <span
                                        className={cn(
                                          "size-1.5 shrink-0 rounded-full",
                                          entry.kind === "entrada"
                                            ? "bg-emerald-400"
                                            : "bg-rose-400"
                                        )}
                                      />
                                      <span className="min-w-0 flex-1 truncate font-medium">
                                        {entry.name}
                                      </span>
                                      {entry.group_name && (
                                        <Badge
                                          variant="outline"
                                          className="shrink-0 text-[10px]"
                                        >
                                          {entry.group_name}
                                        </Badge>
                                      )}
                                      {entry.status !== "previsto" && (
                                        <span className="shrink-0 text-[10px] text-muted-foreground">
                                          {STATUS_LABEL[entry.status]}
                                        </span>
                                      )}
                                      {entry.method && (
                                        <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:inline">
                                          {entry.method}
                                        </span>
                                      )}
                                      <span
                                        className={cn(
                                          "shrink-0 tabular-nums",
                                          entry.kind === "entrada"
                                            ? "text-emerald-400"
                                            : "text-rose-400"
                                        )}
                                      >
                                        {money(Number(entry.amount))}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="text-[11px] font-semibold">
                      <td className="p-3">Total</td>
                      <td className="p-3 text-right tabular-nums text-muted-foreground">
                        {totals.count}
                      </td>
                      <td className="p-3 text-right tabular-nums text-emerald-400">
                        {hasIncome ? money(totals.entradas) : "—"}
                      </td>
                      <td className="p-3 text-right tabular-nums text-rose-400">
                        {money(totals.saidas)}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {hasIncome ? money(totals.saldo) : "—"}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
            <TrendingDown className="mt-0.5 size-3.5 shrink-0" />
            Os números desta tela vêm só da planilha importada. Reimportar um mês
            substitui as linhas daquele mês; os outros meses não são tocados.
          </p>
        </>
      )}

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
