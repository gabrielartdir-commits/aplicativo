"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ListPlus,
  PiggyBank,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ExpenseDialog } from "@/features/home/components/expense-dialog";
import { BalanceAdjustmentDialog } from "@/features/home/components/balance-adjustment-dialog";
import { useBudgets } from "@/hooks/use-budgets";
import { useCurrentMonth } from "@/hooks/use-current-month";
import {
  useLedger,
  useLedgerMutations,
  type LedgerEntry,
  type LedgerKind,
} from "@/hooks/use-ledger";
import { monthLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/utils/format";
import { AnnualFlow } from "./annual-flow";
import { RecurringIncomesPanel } from "./recurring-incomes-panel";

type Filter = "tudo" | "entradas" | "saidas";
type View = "mes" | "ano";

const KIND_STYLE: Record<
  LedgerKind,
  { label: string; className: string }
> = {
  income: { label: "Entrada", className: "border-primary/30 text-primary" },
  expense: { label: "Gasto", className: "border-rose-500/30 text-rose-400" },
  investment: {
    label: "Aporte",
    className: "border-sky-500/30 text-sky-400",
  },
  adjustment: {
    label: "Ajuste",
    className: "border-amber-500/30 text-amber-400",
  },
};

function EntryRow({ entry }: { entry: LedgerEntry }) {
  const { remove } = useLedgerMutations();
  const positive = entry.signedAmount > 0;
  const style = KIND_STYLE[entry.kind];

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-[10px]",
            positive
              ? "bg-primary/10 text-primary"
              : "bg-rose-500/10 text-rose-400"
          )}
        >
          {positive ? (
            <ArrowDownLeft className="size-4" />
          ) : (
            <ArrowUpRight className="size-4" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{entry.label}</p>
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
            <Badge variant="outline" className={cn("text-[9px]", style.className)}>
              {style.label}
            </Badge>
            {entry.detail && <span>{entry.detail}</span>}
            <span className="tabular-nums">
              · {formatDate(`${entry.date}T00:00:00`)}
            </span>
          </div>
        </div>

        <span
          className={cn(
            "shrink-0 text-sm font-bold tabular-nums",
            positive ? "text-primary" : "text-foreground/80"
          )}
        >
          {positive ? "+" : "−"}
          {formatCurrency(Math.abs(entry.signedAmount)).replace("R$", "").trim()}
        </span>

        <button
          onClick={() => {
            if (window.confirm(`Remover "${entry.label}"? O saldo é recalculado.`)) {
              remove.mutate(entry);
            }
          }}
          aria-label={`Remover ${entry.label}`}
          disabled={remove.isPending}
          className="shrink-0 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40"
        >
          <Trash2 className="size-3.5" />
        </button>
      </CardContent>
    </Card>
  );
}

export function FlowView() {
  const { data: month } = useCurrentMonth();
  const { data: budgets } = useBudgets(month?.id);
  const { entries, totals } = useLedger();
  const [filter, setFilter] = useState<Filter>("tudo");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [view, setView] = useState<View>("mes");

  const visible = useMemo(() => {
    if (filter === "entradas") return entries.filter((e) => e.signedAmount > 0);
    if (filter === "saidas") return entries.filter((e) => e.signedAmount < 0);
    return entries;
  }, [entries, filter]);

  const net = totals.inflow - totals.outflow;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fluxo"
        description={
          view === "ano"
            ? "Entradas e saídas de todos os meses do ano."
            : month
              ? `Entradas e saídas de ${monthLabel(month).toLowerCase()}.`
              : "Entradas e saídas do mês."
        }
      />

      <Tabs<View>
        items={[
          { value: "mes", label: "Mês atual" },
          { value: "ano", label: "Ano" },
        ]}
        value={view}
        onValueChange={setView}
      />

      {view === "ano" ? (
        <AnnualFlow initialYear={month?.year ?? new Date().getFullYear()} />
      ) : (
        <>
      {/* Entradas × saídas */}
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <Card>
          <CardContent className="space-y-1 p-3 md:p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Entrou
            </p>
            <p className="text-base font-bold tabular-nums text-primary md:text-xl">
              {formatCurrency(totals.inflow)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 p-3 md:p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Saiu
            </p>
            <p className="text-base font-bold tabular-nums text-rose-400 md:text-xl">
              {formatCurrency(totals.outflow)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 p-3 md:p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Resultado
            </p>
            <p
              className={cn(
                "text-base font-bold tabular-nums md:text-xl",
                net >= 0 ? "text-foreground" : "text-rose-400"
              )}
            >
              {formatCurrency(net)}
            </p>
          </CardContent>
        </Card>
      </div>

      <RecurringIncomesPanel />

      {/* Backlog */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground">
              Backlog do mês
            </p>
            <p className="text-[10px] text-muted-foreground">
              {entries.length}{" "}
              {entries.length === 1 ? "movimento" : "movimentos"} · remova para
              corrigir na fonte
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAdjustOpen(true)}
              disabled={!month}
            >
              <SlidersHorizontal />
              Ajuste
            </Button>
            <Button
              size="sm"
              onClick={() => setExpenseOpen(true)}
              disabled={!month}
            >
              <ListPlus />
              Lançar
            </Button>
          </div>
        </div>

        <Tabs<Filter>
          items={[
            { value: "tudo", label: "Tudo", count: entries.length },
            {
              value: "entradas",
              label: "Entradas",
              count: entries.filter((e) => e.signedAmount > 0).length,
            },
            {
              value: "saidas",
              label: "Saídas",
              count: entries.filter((e) => e.signedAmount < 0).length,
            },
          ]}
          value={filter}
          onValueChange={setFilter}
        />

        {visible.length === 0 ? (
          <EmptyState
            icon={PiggyBank}
            title="Nenhum movimento"
            description="Lance um gasto ou uma receita para o backlog começar a registrar o fluxo do mês."
          />
        ) : (
          <div className="space-y-2">
            {visible.map((entry) => (
              <EntryRow key={`${entry.source}-${entry.id}`} entry={entry} />
            ))}
          </div>
        )}
      </div>

      {month && (
        <>
          <ExpenseDialog
            open={expenseOpen}
            onOpenChange={setExpenseOpen}
            month={month}
            categories={(budgets ?? []).map((b) => b.category)}
          />
          <BalanceAdjustmentDialog
            open={adjustOpen}
            onOpenChange={setAdjustOpen}
            month={month}
          />
        </>
      )}
        </>
      )}
    </div>
  );
}
