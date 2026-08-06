"use client";

import { useMemo, useState } from "react";
import {
  CalendarRange,
  CreditCard as CardIcon,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { PurchaseDialog } from "@/components/shared/purchase-dialog";
import { useCurrentMonth } from "@/hooks/use-current-month";
import { useCardPurchases, useUpcomingInstallments } from "@/hooks/use-cards";
import { usePurchaseMutations } from "@/hooks/use-card-mutations";
import { shortCompetenceLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils/format";
import type { PurchaseWithInstallments } from "@/types/domain";

/**
 * Quantas parcelas já venceram até a competência atual.
 *
 * Compras cadastradas em andamento não têm as parcelas anteriores no banco —
 * elas saíram de faturas que o app nunca viu. `first_installment_no` guarda
 * quantas ficaram para trás, e elas contam como pagas.
 */
function paidCount(
  purchase: PurchaseWithInstallments,
  year: number,
  month: number
): number {
  const before = purchase.first_installment_no - 1;
  const elapsed = purchase.installments.filter(
    (i) => i.year < year || (i.year === year && i.month <= month)
  ).length;
  return before + elapsed;
}

export function InstallmentsView() {
  const { data: month } = useCurrentMonth();
  const { data: purchases } = useCardPurchases();
  const { data: upcoming } = useUpcomingInstallments(month?.year, month?.month);
  const { remove } = usePurchaseMutations();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseWithInstallments | null>(null);

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(purchase: PurchaseWithInstallments) {
    setEditing(purchase);
    setDialogOpen(true);
  }

  const list = useMemo(() => purchases ?? [], [purchases]);

  /** Só o que ainda tem parcela a vencer aparece como ativo. */
  const active = useMemo(() => {
    if (!month) return [];
    return list.filter(
      (p) => paidCount(p, month.year, month.month) < p.installments_count
    );
  }, [list, month]);

  const finished = useMemo(() => {
    if (!month) return [];
    return list.filter(
      (p) => paidCount(p, month.year, month.month) >= p.installments_count
    );
  }, [list, month]);

  /** Parcela deste mês somada — é o que já está dentro da sua fatura. */
  const thisMonthTotal = useMemo(() => {
    if (!month) return 0;
    return (upcoming ?? [])
      .filter((i) => i.year === month.year && i.month === month.month)
      .reduce((sum, i) => sum + Number(i.amount), 0);
  }, [upcoming, month]);

  /** Tudo que ainda falta pagar, somando todas as parcelas futuras. */
  const futureTotal = useMemo(
    () => (upcoming ?? []).reduce((sum, i) => sum + Number(i.amount), 0),
    [upcoming]
  );

  /** Calendário: total comprometido por competência, daqui pra frente. */
  const calendar = useMemo(() => {
    const map = new Map<string, { year: number; month: number; total: number; count: number }>();
    for (const inst of upcoming ?? []) {
      const key = `${inst.year}-${inst.month}`;
      const entry = map.get(key) ?? {
        year: inst.year,
        month: inst.month,
        total: 0,
        count: 0,
      };
      entry.total += Number(inst.amount);
      entry.count += 1;
      map.set(key, entry);
    }
    return [...map.values()]
      .sort((a, b) => a.year - b.year || a.month - b.month)
      .slice(0, 12);
  }, [upcoming]);

  const peak = Math.max(...calendar.map((c) => c.total), 1);

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        title="Parcelas"
        description="Compras no cartão divididas ao longo dos meses."
      >
        <Button size="sm" onClick={openNew}>
          <Plus />
          Nova compra
        </Button>
      </PageHeader>

      {/* Resumo */}
      <div className="grid grid-cols-2 gap-2 md:gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-3 md:p-4 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Neste mês
            </p>
            <p className="text-lg md:text-xl font-bold tabular-nums text-foreground">
              {formatCurrency(thisMonthTotal)}
            </p>
            <p className="text-[10px] text-muted-foreground">Já dentro da fatura</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 md:p-4 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Falta pagar
            </p>
            <p className="text-lg md:text-xl font-bold tabular-nums text-amber-400">
              {formatCurrency(futureTotal)}
            </p>
            <p className="text-[10px] text-muted-foreground">Todas as parcelas futuras</p>
          </CardContent>
        </Card>
        <Card className="col-span-2 md:col-span-1">
          <CardContent className="p-3 md:p-4 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Compras ativas
            </p>
            <p className="text-lg md:text-xl font-bold tabular-nums text-foreground">
              {active.length}
            </p>
            <p className="text-[10px] text-muted-foreground">Ainda com parcelas a vencer</p>
          </CardContent>
        </Card>
      </div>

      {/* Calendário de parcelas */}
      {calendar.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <CalendarRange className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">Calendário de parcelas</h2>
          </div>
          <Card>
            <CardContent className="p-3 md:p-4">
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                {calendar.map((c) => (
                  <div
                    key={`${c.year}-${c.month}`}
                    className="flex min-w-[76px] flex-1 flex-col items-center gap-2 rounded-[14px] border border-border/30 bg-accent/5 p-2.5"
                  >
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">
                      {shortCompetenceLabel(c)}
                    </span>
                    <div className="flex h-16 w-full items-end">
                      <div
                        className="w-full rounded-md bg-primary/70"
                        style={{ height: `${Math.max((c.total / peak) * 100, 6)}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-semibold tabular-nums text-foreground">
                      {formatCurrency(c.total)}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {c.count}x
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Compras ativas */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Em andamento</h2>
        {active.length === 0 ? (
          <EmptyState
            icon={CardIcon}
            title="Nenhuma compra parcelada"
            description="Lance uma compra no cartão para acompanhar as parcelas mês a mês."
          />
        ) : (
          <div className="space-y-2">
            {active.map((purchase) => {
              const done = month
                ? paidCount(purchase, month.year, month.month)
                : 0;
              const ratio = done / purchase.installments_count;
              const last = [...purchase.installments].sort(
                (a, b) => a.year - b.year || a.month - b.month
              )[purchase.installments.length - 1];
              const perInstallment =
                purchase.installments[0]?.amount ?? purchase.total_amount;

              return (
                <Card key={purchase.id}>
                  <CardContent className="p-3 md:p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {purchase.description}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                          <Badge variant="outline" className="text-[9px]">
                            {purchase.card.name}
                          </Badge>
                          {purchase.category && (
                            <span>
                              {purchase.category.emoji} {purchase.category.name}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold tabular-nums text-foreground">
                          {formatCurrency(Number(perInstallment))}
                        </p>
                        <p className="text-[10px] text-muted-foreground">por mês</p>
                      </div>
                    </div>

                    <Progress value={ratio * 100} className="h-1.5 bg-accent" />

                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="tabular-nums">
                        <span className="font-semibold text-foreground">
                          {done}
                        </span>{" "}
                        de {purchase.installments_count} parcelas
                      </span>
                      <span className="flex items-center gap-2">
                        {last && (
                          <span>
                            termina em{" "}
                            <span className="font-semibold text-foreground">
                              {shortCompetenceLabel(last)}
                            </span>
                          </span>
                        )}
                        <button
                          onClick={() => openEdit(purchase)}
                          aria-label="Editar compra"
                          className="text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          onClick={() => remove.mutate(purchase.id)}
                          aria-label="Remover compra"
                          className="text-muted-foreground transition-colors hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </span>
                    </div>

                    {/* Trilha de parcelas */}
                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                      {purchase.first_installment_no > 1 && (
                        <span
                          title="Parcelas pagas antes do cadastro no app"
                          className="rounded bg-accent/20 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground"
                        >
                          {purchase.first_installment_no - 1}x antes
                        </span>
                      )}
                      {[...purchase.installments]
                        .sort((a, b) => a.installment_no - b.installment_no)
                        .map((inst) => {
                          const isPast =
                            month &&
                            (inst.year < month.year ||
                              (inst.year === month.year &&
                                inst.month < month.month));
                          const isCurrent =
                            month &&
                            inst.year === month.year &&
                            inst.month === month.month;
                          return (
                            <span
                              key={inst.id}
                              title={`${inst.installment_no}ª — ${formatCurrency(Number(inst.amount))}`}
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[9px] font-semibold tabular-nums",
                                isPast && "bg-primary/15 text-primary/70",
                                isCurrent &&
                                  "bg-primary text-primary-foreground",
                                !isPast &&
                                  !isCurrent &&
                                  "bg-accent/20 text-muted-foreground"
                              )}
                            >
                              {shortCompetenceLabel(inst)}
                            </span>
                          );
                        })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Concluídas */}
      {finished.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Quitadas
          </h2>
          <div className="space-y-2">
            {finished.map((purchase) => (
              <Card key={purchase.id} className="opacity-60">
                <CardContent className="flex items-center justify-between p-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">
                      {purchase.description}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {purchase.installments_count}x · {purchase.card.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                      {formatCurrency(Number(purchase.total_amount))}
                    </span>
                    <button
                      onClick={() => openEdit(purchase)}
                      aria-label="Editar compra"
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      onClick={() => remove.mutate(purchase.id)}
                      aria-label="Remover compra"
                      className="text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <PurchaseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        purchase={editing}
      />
    </div>
  );
}
