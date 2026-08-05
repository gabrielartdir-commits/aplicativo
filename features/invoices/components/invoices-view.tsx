"use client";

import { useMemo, useState } from "react";
import {
  CalendarClock,
  CreditCard as CardIcon,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { CreditCardDialog } from "@/components/shared/credit-card-dialog";
import { useCurrentMonth } from "@/hooks/use-current-month";
import { useCreditCards, useInvoices } from "@/hooks/use-cards";
import {
  useCreditCardMutations,
  useInvoiceMutations,
} from "@/hooks/use-card-mutations";
import { monthLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/utils/format";
import type { CreditCard } from "@/types/domain";

export function InvoicesView() {
  const { data: month } = useCurrentMonth();
  const { data: cards } = useCreditCards();
  const { data: invoices } = useInvoices(month?.year, month?.month);
  const { remove } = useCreditCardMutations();
  const { setPaid } = useInvoiceMutations();

  const [cardDialogOpen, setCardDialogOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<CreditCard | null>(null);

  const list = useMemo(() => invoices ?? [], [invoices]);

  const openTotal = list
    .filter((i) => !i.paid)
    .reduce((sum, i) => sum + Number(i.total), 0);
  const paidTotal = list
    .filter((i) => i.paid)
    .reduce((sum, i) => sum + Number(i.total), 0);
  const subscriptionsTotal = list.reduce(
    (sum, i) => sum + Number(i.subscriptions_total),
    0
  );

  function openNewCard() {
    setEditingCard(null);
    setCardDialogOpen(true);
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        title="Faturas"
        description={
          month
            ? `Cartões de crédito em ${monthLabel(month).toLowerCase()}.`
            : "Cartões de crédito e seus vencimentos."
        }
      >
        <Button size="sm" variant="outline" onClick={openNewCard}>
          <Plus />
          Novo cartão
        </Button>
      </PageHeader>

      {/* Resumo */}
      <div className="grid grid-cols-2 gap-2 md:gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-3 md:p-4 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Em aberto
            </p>
            <p className="text-lg md:text-xl font-bold tabular-nums text-amber-400">
              {formatCurrency(openTotal)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              Reservado do disponível
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 md:p-4 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Já pago
            </p>
            <p className="text-lg md:text-xl font-bold tabular-nums text-primary">
              {formatCurrency(paidTotal)}
            </p>
          </CardContent>
        </Card>
        <Card className="col-span-2 md:col-span-1">
          <CardContent className="p-3 md:p-4 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Assinaturas incluídas
            </p>
            <p className="text-lg md:text-xl font-bold tabular-nums text-foreground">
              {formatCurrency(subscriptionsTotal)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              Dentro dos totais acima
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Faturas */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Faturas do mês</h2>
        {list.length === 0 ? (
          <EmptyState
            icon={CardIcon}
            title="Nenhuma fatura neste mês"
            description="Cadastre um cartão e lance compras ou assinaturas para gerar a fatura."
          />
        ) : (
          <div className="space-y-2">
            {list.map((invoice) => (
              <Card
                key={invoice.id}
                className={cn(
                  invoice.paid && "opacity-60",
                  !invoice.paid && Number(invoice.total) > 0 && "border-amber-500/20"
                )}
              >
                <CardContent className="p-3 md:p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {invoice.card.name}
                      </p>
                      <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <CalendarClock className="size-3" />
                        vence em{" "}
                        <span className="font-semibold tabular-nums text-foreground">
                          {formatDate(`${invoice.due_date}T00:00:00`)}
                        </span>
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={cn(
                          "text-base font-bold tabular-nums",
                          invoice.paid ? "text-muted-foreground" : "text-foreground"
                        )}
                      >
                        {formatCurrency(Number(invoice.total))}
                      </p>
                      {invoice.paid && (
                        <Badge variant="outline" className="mt-1 text-[9px]">
                          Paga
                        </Badge>
                      )}
                    </div>
                  </div>

                  <Separator className="bg-border/30" />

                  {/* Composição da fatura */}
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="space-y-0.5">
                      <span className="block text-muted-foreground">Parcelas</span>
                      <span className="font-semibold tabular-nums text-foreground/80">
                        {formatCurrency(Number(invoice.installments_total))}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      <span className="block text-muted-foreground">
                        Assinaturas
                      </span>
                      <span className="font-semibold tabular-nums text-foreground/80">
                        {formatCurrency(Number(invoice.subscriptions_total))}
                      </span>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 pt-0.5 text-xs">
                    <Checkbox
                      checked={invoice.paid}
                      disabled={setPaid.isPending}
                      onCheckedChange={(checked) =>
                        setPaid.mutate({ invoice, paid: checked === true })
                      }
                    />
                    Fatura paga
                  </label>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Cartões cadastrados */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Meus cartões
        </h2>
        {(cards ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhum cartão cadastrado ainda.
          </p>
        ) : (
          <div className="space-y-2">
            {(cards ?? []).map((card) => (
              <Card key={card.id} className={cn(!card.active && "opacity-50")}>
                <CardContent className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">{card.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      fecha dia {card.closing_day} · vence dia {card.due_day}
                      {Number(card.credit_limit) > 0 &&
                        ` · limite ${formatCurrency(Number(card.credit_limit))}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      onClick={() => {
                        setEditingCard(card);
                        setCardDialogOpen(true);
                      }}
                      aria-label="Editar cartão"
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      onClick={() => remove.mutate(card.id)}
                      aria-label="Remover cartão"
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
      </section>

      <CreditCardDialog
        open={cardDialogOpen}
        onOpenChange={setCardDialogOpen}
        card={editingCard}
      />
    </div>
  );
}
