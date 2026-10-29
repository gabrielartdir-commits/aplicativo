"use client";

import { Fragment, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CalendarClock,
  ChevronDown,
  CreditCard,
  Receipt,
  Repeat,
  ShoppingBag,
  TrendingDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { useForecastProjection } from "@/hooks/use-forecast";
import { monthLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils/format";
import type { LabelProps } from "recharts";
import type { ForecastMonth, ForecastPart } from "@/types/forecast";

/**
 * Uma cor por parte, igual nos dois gráficos e na tabela.
 *
 * Os variáveis ficam em cinza de propósito: são o único número estimado da
 * tela, e a cor neutra evita que uma média pareça um compromisso assumido.
 */
const PART: Record<
  ForecastPart,
  { label: string; color: string; icon: typeof Receipt; hint: string }
> = {
  fixos: {
    label: "Contas fixas",
    color: "#38bdf8",
    icon: Receipt,
    hint: "as contas fixas ativas, repetidas em todos os meses",
  },
  assinaturas: {
    label: "Assinaturas",
    color: "#a78bfa",
    icon: Repeat,
    hint: "as assinaturas ativas, a partir do mês em que começaram",
  },
  parcelas: {
    label: "Parcelas",
    color: "#fb7185",
    icon: CreditCard,
    hint: "as parcelas de cartão que caem em cada mês — é a parte que acaba",
  },
  variaveis: {
    label: "Variáveis (média)",
    color: "#94a3b8",
    icon: ShoppingBag,
    hint: "a média do que você gastou por mês: lançamentos mais a parte avulsa da fatura",
  },
};

const PART_ORDER: ForecastPart[] = [
  "fixos",
  "assinaturas",
  "parcelas",
  "variaveis",
];

const INCOME_COLOR = "#34d399";

const money = (value: number) => formatCurrency(value);

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
        {hint && <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

interface TooltipEntry {
  name?: string;
  value?: number;
  color?: string;
  dataKey?: string;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((item) => (item.value ?? 0) !== 0);
  const outflow = rows
    .filter((item) => item.dataKey !== "entradas")
    .reduce((sum, item) => sum + (item.value ?? 0), 0);

  // Só o gráfico de saídas traz entradas; no de sobra acumulada não há o que
  // subtrair, e aí a linha da sobra do mês não aparece.
  const incomeRow = payload.find((item) => item.dataKey === "entradas");
  const income = incomeRow ? (incomeRow.value ?? 0) : null;

  return (
    <div className="rounded-lg border bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <p className="mb-1.5 font-semibold">{label}</p>
      <div className="space-y-1">
        {rows.map((item) => (
          <div key={item.dataKey} className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: item.color }}
            />
            <span className="text-muted-foreground">{item.name}</span>
            <span className="ml-auto font-medium tabular-nums">
              {money(item.value ?? 0)}
            </span>
          </div>
        ))}
      </div>
      {/*
        Só o gráfico de saídas fecha uma conta: ele tem as partes e as
        entradas. No de sobra acumulada há uma série só, e somar "tudo que
        não é entrada" devolvia a própria sobra rotulada como "Saída total".
      */}
      {income !== null && outflow > 0 && (
        <div className="mt-1.5 space-y-1 border-t pt-1.5">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Saída total</span>
            <span className="ml-auto font-semibold tabular-nums">
              {money(outflow)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Sobra do mês</span>
            <span
              className={cn(
                "ml-auto font-semibold tabular-nums",
                income - outflow < 0 ? "text-rose-400" : "text-emerald-400"
              )}
            >
              {money(income - outflow)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Lista dos itens de um mês, agrupada por parte. */
function MonthItems({ month }: { month: ForecastMonth }) {
  return (
    <div className="grid gap-4 border-t bg-muted/20 px-4 py-4 md:grid-cols-2">
      {PART_ORDER.map((part) => {
        const items = month.items.filter((item) => item.part === part);
        if (items.length === 0) return null;
        const Icon = PART[part].icon;
        const total = items.reduce((sum, item) => sum + item.amount, 0);

        return (
          <div key={part} className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <Icon className="size-3" style={{ color: PART[part].color }} />
              {PART[part].label}
              <span className="ml-auto tabular-nums normal-case">
                {money(total)}
              </span>
            </p>
            <ul className="space-y-1">
              {items.map((item, index) => (
                <li
                  key={`${item.label}-${index}`}
                  className="flex items-baseline gap-2 text-xs"
                >
                  <span className="truncate">{item.label}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {item.detail}
                  </span>
                  <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                    {money(item.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function ForecastView() {
  const { data: projection, isLoading } = useForecastProjection();
  const [open, setOpen] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-8">
        <PageHeader title="Próximos meses" description="Calculando a projeção…" />
      </div>
    );
  }

  const months = projection?.months ?? [];

  if (!projection || months.length === 0) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Próximos meses"
          description="Projeção dos 12 meses seguintes."
        />
        <EmptyState
          icon={CalendarClock}
          title="Sem mês aberto para projetar"
          description="A projeção parte do mês em andamento. Abra um mês na tela Hoje e volte aqui — ela é calculada sozinha, a partir das suas contas fixas, assinaturas e parcelas."
        />
      </div>
    );
  }

  const heaviest = months.reduce((worst, item) =>
    item.saidas > worst.saidas ? item : worst
  );
  const lightest = months.reduce((best, item) =>
    item.saidas < best.saidas ? item : best
  );
  const averageOut = projection.totals.saidas / months.length;
  const last = months[months.length - 1];

  const chartData = months.map((item) => ({
    competence: item.competence,
    fixos: item.fixos,
    assinaturas: item.assinaturas,
    parcelas: item.parcelas,
    variaveis: item.variaveis,
    entradas: item.entradas,
    saldo: item.saldo,
    acumulado: item.acumulado,
  }));

  /*
   * A sobra do mês escrita acima da coluna.
   *
   * Vai pendurada na última barra da pilha, que é a que o Recharts posiciona
   * no topo — `y` já é o alto da coluna inteira, mesmo quando essa última
   * parte vale zero. Verde ou vermelho conforme o sinal, porque o mês em que
   * falta dinheiro é justamente o que precisa saltar aos olhos.
   */
  const renderSobra = (props: LabelProps) => {
    const { x, y, width, index } = props;
    const item = chartData[index ?? -1];
    if (!item || x === undefined || y === undefined || width === undefined) {
      return null;
    }

    /*
     * O texto encolhe conforme a coluna: com doze meses numa janela estreita,
     * "R$ 1.594,60" em todas elas vira uma linha de números sobrepostos. Os
     * centavos caem primeiro, e abaixo de ~26px de coluna o rótulo some — o
     * valor exato continua na dica do gráfico e na tabela.
     */
    const column = Number(width);
    if (column < 26) return null;

    return (
      <text
        x={Number(x) + column / 2}
        y={Number(y) - 7}
        textAnchor="middle"
        fontSize={column < 56 ? 9 : 10}
        fontWeight={600}
        fill={item.saldo < 0 ? "#fb7185" : "#34d399"}
      >
        {column < 56
          ? item.saldo.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
              maximumFractionDigits: 0,
            })
          : money(item.saldo)}
      </text>
    );
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Próximos meses"
        description={`De ${monthLabel(months[0])} a ${monthLabel(last)}, calculado a partir das suas contas fixas, assinaturas, parcelas e da média dos gastos variáveis.`}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Saída por mês"
          value={money(averageOut)}
          hint={`${money(projection.totals.saidas)} nos ${months.length} meses`}
        />
        <Stat
          label="Mês mais pesado"
          value={money(heaviest.saidas)}
          hint={monthLabel(heaviest)}
          tone="negative"
        />
        <Stat
          label="Mês mais leve"
          value={money(lightest.saidas)}
          hint={monthLabel(lightest)}
          tone="positive"
        />
        <Stat
          label="Sobra prevista no período"
          value={money(projection.totals.saldo)}
          hint={
            projection.monthly.entradas > 0
              ? `com ${money(projection.monthly.entradas)} de entradas por mês`
              : "sem entradas fixas cadastradas"
          }
          tone={projection.totals.saldo < 0 ? "negative" : "positive"}
        />
      </div>

      {/* Como a projeção é feita — a tela é um palpite e precisa dizer de quê. */}
      <Card>
        <CardContent className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            De onde sai cada número
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PART_ORDER.map((part) => {
              const Icon = PART[part].icon;
              const value =
                part === "parcelas"
                  ? months[0].parcelas
                  : projection.monthly[
                      part as "fixos" | "assinaturas" | "variaveis"
                    ];
              return (
                <div key={part} className="space-y-1">
                  <p className="flex items-center gap-1.5 text-xs font-semibold">
                    <Icon
                      className="size-3.5"
                      style={{ color: PART[part].color }}
                    />
                    {PART[part].label}
                    <span className="ml-auto tabular-nums">{money(value)}</span>
                  </p>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {PART[part].hint}
                  </p>
                </div>
              );
            })}
          </div>

          {projection.average.monthsUsed > 0 && (
            <div className="space-y-2 border-t pt-3 text-[11px] text-muted-foreground">
              <p>
                Média de{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {money(projection.average.value)}
                </span>
                , calculada com os gastos de{" "}
                {projection.average.monthsUsed === 1
                  ? "1 mês"
                  : `${projection.average.monthsUsed} meses`}
                . Entram os lançamentos do mês e a parte da fatura do cartão
                que não é parcela nem assinatura — compra avulsa no crédito é
                gasto variável igual.
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {projection.average.perMonth.map((item) => (
                  <span key={item.competence} className="tabular-nums">
                    <span className="font-medium text-foreground">
                      {item.competence}
                    </span>{" "}
                    {money(item.total)}
                    {item.cartao > 0 && (
                      <span className="opacity-70">
                        {" "}
                        ({money(item.lancado)} lançado + {money(item.cartao)} no
                        cartão)
                      </span>
                    )}
                  </span>
                ))}
              </div>
              {projection.average.partial && (
                <Badge variant="outline" className="text-[10px]">
                  mês em andamento — a média sobe quando ele fechar
                </Badge>
              )}
            </div>
          )}
          {projection.average.monthsUsed === 0 && (
            <p className="border-t pt-3 text-[11px] text-muted-foreground">
              Ainda não há gastos para calcular a média dos variáveis — nem
              lançamentos, nem fatura declarada acima das parcelas. A projeção
              mostra só os compromissos já cadastrados, e fica mais realista
              depois do primeiro mês preenchido.
            </p>
          )}
          {projection.lastInstallment && (
            <p className="text-[11px] text-muted-foreground">
              A última parcela conhecida cai em{" "}
              <span className="font-semibold text-foreground">
                {projection.lastInstallment}
              </span>
              . Depois dela, o cartão deixa de pesar na projeção.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Saídas por mês, abertas por parte, com a linha das entradas. */}
      <Card>
        <CardContent className="space-y-4">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-semibold">Saídas por mês</p>
            <p className="text-[11px] text-muted-foreground">
              acima de cada coluna, o que sobra no mês
            </p>
          </div>
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  className="stroke-border/40"
                />
                <XAxis
                  dataKey="competence"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value: number) =>
                    value >= 1000 ? `${Math.round(value / 1000)}k` : String(value)
                  }
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                />
                {PART_ORDER.map((part, index) => (
                  <Bar
                    key={part}
                    dataKey={part}
                    name={PART[part].label}
                    stackId="saidas"
                    fill={PART[part].color}
                    radius={part === "variaveis" ? [4, 4, 0, 0] : undefined}
                  >
                    {index === PART_ORDER.length - 1 && (
                      <LabelList dataKey="saldo" content={renderSobra} />
                    )}
                  </Bar>
                ))}
                <Line
                  type="monotone"
                  dataKey="entradas"
                  name="Entradas"
                  stroke={INCOME_COLOR}
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Sobra acumulada: onde o saldo do período vira ou deixa de virar caixa. */}
      <Card>
        <CardContent className="space-y-4">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-semibold">Sobra acumulada</p>
            <p className="text-[11px] text-muted-foreground">
              entradas menos saídas, somadas mês a mês
            </p>
          </div>
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
              >
                <defs>
                  <linearGradient id="acumulado" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={INCOME_COLOR} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={INCOME_COLOR} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  className="stroke-border/40"
                />
                <XAxis
                  dataKey="competence"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value: number) =>
                    value >= 1000 || value <= -1000
                      ? `${Math.round(value / 1000)}k`
                      : String(value)
                  }
                />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={0} className="stroke-border" />
                <Area
                  type="monotone"
                  dataKey="acumulado"
                  name="Sobra acumulada"
                  stroke={INCOME_COLOR}
                  strokeWidth={2}
                  fill="url(#acumulado)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Mês a mês, com os itens de cada um. */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 text-left font-bold">Mês</th>
                  <th className="px-3 py-3 text-right font-bold">Fixas</th>
                  <th className="px-3 py-3 text-right font-bold">Assin.</th>
                  <th className="px-3 py-3 text-right font-bold">Parcelas</th>
                  <th className="px-3 py-3 text-right font-bold">Variáveis</th>
                  <th className="px-3 py-3 text-right font-bold">Saída</th>
                  <th className="px-4 py-3 text-right font-bold">Sobra</th>
                </tr>
              </thead>
              <tbody>
                {months.map((item) => {
                  const key = `${item.year}-${item.month}`;
                  const isOpen = open === key;
                  return (
                    <Fragment key={key}>
                      <tr
                        className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/40"
                        onClick={() => setOpen(isOpen ? null : key)}
                      >
                        <td className="px-4 py-2.5">
                          <span className="flex items-center gap-1.5 font-medium">
                            <ChevronDown
                              className={cn(
                                "size-3.5 shrink-0 text-muted-foreground transition-transform",
                                isOpen && "rotate-180"
                              )}
                            />
                            {item.competence}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {money(item.fixos)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {money(item.assinaturas)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {item.parcelas > 0 ? (
                            money(item.parcelas)
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {money(item.variaveis)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                          {money(item.saidas)}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-2.5 text-right font-semibold tabular-nums",
                            item.saldo < 0 ? "text-rose-400" : "text-emerald-400"
                          )}
                        >
                          {money(item.saldo)}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={7} className="p-0">
                            <MonthItems month={item} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30 text-[11px] font-semibold uppercase tracking-wider">
                  <td className="px-4 py-3">Total do período</td>
                  <td colSpan={4} />
                  <td className="px-3 py-3 text-right tabular-nums">
                    {money(projection.totals.saidas)}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right tabular-nums",
                      projection.totals.saldo < 0
                        ? "text-rose-400"
                        : "text-emerald-400"
                    )}
                  >
                    {money(projection.totals.saldo)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
        <TrendingDown className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Esta tela não guarda nada: ela é recalculada a cada visita. Para mudar
          a projeção, mude o que ela lê — contas fixas, assinaturas e compras
          parceladas. A média dos variáveis acompanha sozinha o que você lança.
        </span>
      </p>
    </div>
  );
}
