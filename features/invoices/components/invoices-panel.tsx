"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  ChevronDown,
  CreditCard as CardIcon,
  Pencil,
  Plus,
  Repeat,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/shared/empty-state";
import { CreditCardDialog } from "@/components/shared/credit-card-dialog";
import { useCurrentMonth } from "@/hooks/use-current-month";
import {
  useCreditCards,
  useInstallments,
  useInvoices,
  useSubscriptions,
} from "@/hooks/use-cards";
import {
  useCreditCardMutations,
  useEnsureInvoices,
  useInvoiceMutations,
} from "@/hooks/use-card-mutations";
import { monthLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/utils/format";
import type { CreditCard, InvoiceWithCard } from "@/types/domain";
import { DeclaredTotalField } from "./declared-total-field";
import { AdvanceMonthButton } from "./advance-month-button";

/** O que compõe a fatura: cada parcela e cada assinatura, item a item. */
function InvoiceComposition({ invoice }: { invoice: InvoiceWithCard }) {
  const { data: month } = useCurrentMonth();
  const { data: installments } = useInstallments(month?.year, month?.month);
  const { data: subscriptions } = useSubscriptions();
  const [open, setOpen] = useState(false);

  const items = useMemo(() => {
    const parcelas = (installments ?? []).filter(
      (i) => i.purchase.card_id === invoice.card_id
    );
    const assinaturas = (subscriptions ?? []).filter(
      (s) =>
        s.active && s.payment_method === "credit" && s.card_id === invoice.card_id
    );
    return { parcelas, assinaturas };
  }, [installments, subscriptions, invoice.card_id]);

  const count = items.parcelas.length + items.assinaturas.length;
  if (count === 0) return null;

  return (
    <div className="rounded-[12px] bg-accent/10">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 p-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      >
        <span>
          {count} {count === 1 ? "item" : "itens"} nesta fatura
        </span>
        <ChevronDown
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="space-y-2.5 px-2.5 pb-2.5">
          {items.parcelas.length > 0 && (
            <div className="space-y-1">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-2">
                Parcelas
              </p>
              {items.parcelas.map((i) => (
                <div key={i.id} className="flex justify-between gap-2 text-[11px]">
                  <span className="min-w-0 truncate text-muted-foreground">
                    {i.purchase.description}{" "}
                    <span className="text-muted-2">
                      {i.installment_no}/{i.purchase.installments_count}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-foreground/80">
                    {formatCurrency(Number(i.amount))}
                  </span>
                </div>
              ))}
            </div>
          )}

          {items.assinaturas.length > 0 && (
            <div className="space-y-1">
              <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-muted-2">
                <Repeat className="size-2.5" />
                Assinaturas
              </p>
              {items.assinaturas.map((s) => (
                <div key={s.id} className="flex justify-between gap-2 text-[11px]">
                  <span className="min-w-0 truncate text-muted-foreground">
                    {s.name}{" "}
                    <span className="text-muted-2">dia {s.billing_day}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-foreground/80">
                    {formatCurrency(Number(s.amount))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Faturas da competência corrente, dentro do hub de Gastos Fixos. */
export function InvoicesPanel() {
  const { data: month } = useCurrentMonth();
  const { data: cards } = useCreditCards();
  const { data: invoices } = useInvoices(month?.year, month?.month);
  const { remove } = useCreditCardMutations();
  const { setPaid } = useInvoiceMutations();

  const [cardDialogOpen, setCardDialogOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<CreditCard | null>(null);

  const list = useMemo(() => invoices ?? [], [invoices]);

  /**
   * Cartão ativo sem fatura na competência não tem onde receber o valor do
   * extrato. Abre as que faltam, uma vez por carga.
   */
  const ensureInvoices = useEnsureInvoices();
  const missing = useMemo(() => {
    if (!month || !cards || !invoices) return 0;
    const withInvoice = new Set(invoices.map((i) => i.card_id));
    return cards.filter((c) => c.active && !withInvoice.has(c.id)).length;
  }, [month, cards, invoices]);

  useEffect(() => {
    if (missing > 0 && ensureInvoices.isIdle) {
      ensureInvoices.mutate();
    }
  }, [missing, ensureInvoices]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {month
            ? `Competência de ${monthLabel(month).toLowerCase()}.`
            : "Faturas por competência."}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditingCard(null);
              setCardDialogOpen(true);
            }}
          >
            <Plus />
            Novo cartão
          </Button>
          <AdvanceMonthButton />
        </div>
      </div>

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
                !invoice.paid &&
                  Number(invoice.total) > 0 &&
                  "border-amber-500/20"
              )}
            >
              <CardContent className="space-y-3 p-3 md:p-4">
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
                        invoice.paid
                          ? "text-muted-foreground"
                          : "text-foreground"
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

                <InvoiceComposition invoice={invoice} />

                <DeclaredTotalField invoice={invoice} />

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

      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground">
          Meus cartões
        </h3>
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
