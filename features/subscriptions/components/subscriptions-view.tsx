"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { SubscriptionDialog } from "@/components/shared/subscription-dialog";
import { useSubscriptions } from "@/hooks/use-cards";
import { useSubscriptionMutations } from "@/hooks/use-card-mutations";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils/format";
import type { SubscriptionWithCard } from "@/types/domain";

export function SubscriptionsView() {
  const { data: subscriptions } = useSubscriptions();
  const { remove } = useSubscriptionMutations();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SubscriptionWithCard | null>(null);

  const list = useMemo(() => subscriptions ?? [], [subscriptions]);
  const active = useMemo(() => list.filter((s) => s.active), [list]);

  const creditTotal = active
    .filter((s) => s.payment_method === "credit")
    .reduce((sum, s) => sum + Number(s.amount), 0);

  const debitTotal = active
    .filter((s) => s.payment_method === "debit")
    .reduce((sum, s) => sum + Number(s.amount), 0);

  const monthlyTotal = creditTotal + debitTotal;

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(subscription: SubscriptionWithCard) {
    setEditing(subscription);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        title="Assinaturas"
        description="Cobranças que se repetem todo mês, no crédito ou no débito."
      >
        <Button size="sm" onClick={openNew}>
          <Plus />
          Nova assinatura
        </Button>
      </PageHeader>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <Card>
          <CardContent className="p-3 md:p-4 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Total mensal
            </p>
            <p className="text-base md:text-xl font-bold tabular-nums text-foreground">
              {formatCurrency(monthlyTotal)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 md:p-4 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              No crédito
            </p>
            <p className="text-base md:text-xl font-bold tabular-nums text-amber-400">
              {formatCurrency(creditTotal)}
            </p>
            <p className="text-[9px] text-muted-foreground">Dentro da fatura</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 md:p-4 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              No débito
            </p>
            <p className="text-base md:text-xl font-bold tabular-nums text-primary">
              {formatCurrency(debitTotal)}
            </p>
            <p className="text-[9px] text-muted-foreground">Reserva do saldo</p>
          </CardContent>
        </Card>
      </div>

      {creditTotal > 0 && (
        <p className="rounded-[14px] border border-border/30 bg-accent/5 px-3.5 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
          As assinaturas no crédito já estão somadas na fatura do cartão — elas
          não descontam duas vezes do seu disponível.
        </p>
      )}

      {/* Lista */}
      {list.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="Nenhuma assinatura"
          description="Cadastre serviços recorrentes como streaming, academia ou software."
        />
      ) : (
        <div className="space-y-2">
          {list.map((sub) => (
            <Card
              key={sub.id}
              className={cn(!sub.active && "opacity-50")}
            >
              <CardContent className="flex items-center justify-between gap-3 p-3 md:p-4">
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {sub.name}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px]",
                        sub.payment_method === "credit"
                          ? "border-amber-500/30 text-amber-400"
                          : "border-primary/30 text-primary"
                      )}
                    >
                      {sub.payment_method === "credit" ? "Crédito" : "Débito"}
                    </Badge>
                    {sub.card && <span>{sub.card.name}</span>}
                    <span>· dia {sub.billing_day}</span>
                    {sub.category && (
                      <span>
                        · {sub.category.emoji} {sub.category.name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-bold tabular-nums text-foreground">
                    {formatCurrency(Number(sub.amount))}
                  </span>
                  <button
                    onClick={() => openEdit(sub)}
                    aria-label="Editar assinatura"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={() => remove.mutate(sub.id)}
                    aria-label="Remover assinatura"
                    className="text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SubscriptionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        subscription={editing}
      />
    </div>
  );
}
