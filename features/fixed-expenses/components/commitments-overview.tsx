"use client";

import { CreditCard, Receipt, Repeat, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useCommitments } from "@/hooks/use-commitments";
import { useCurrentMonth } from "@/hooks/use-current-month";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils/format";

function Line({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  hint?: string;
  tone?: "default" | "muted";
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-[10px]",
          tone === "muted"
            ? "bg-accent/20 text-muted-foreground"
            : "bg-primary/10 text-primary"
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground/90">{label}</p>
        {hint && (
          <p className="text-[10px] leading-tight text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
      <span className="shrink-0 text-sm font-bold tabular-nums">
        {formatCurrency(value)}
      </span>
    </div>
  );
}

/**
 * Total do mês somando contas fixas, faturas e assinaturas no débito.
 *
 * Parcelas e assinaturas no crédito aparecem apenas como composição das
 * faturas — somá-las por fora contaria o mesmo compromisso duas vezes.
 */
export function CommitmentsOverview() {
  const { data: month } = useCurrentMonth();
  const { data: c } = useCommitments();

  const income = month
    ? Number(month.salary) + Number(month.extra_income)
    : 0;
  const share = income > 0 ? Math.min((c.total / income) * 100, 100) : 0;

  return (
    <Card className="border-border/40">
      <CardContent className="space-y-4 p-4 md:p-5">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Comprometido no mês
            </p>
            <p className="text-3xl font-bold tracking-tight tabular-nums text-foreground">
              {formatCurrency(c.total)}
            </p>
          </div>
          {income > 0 && (
            <div className="shrink-0 text-right">
              <p className="text-sm font-bold tabular-nums text-foreground/80">
                {Math.round(share)}%
              </p>
              <p className="text-[10px] text-muted-foreground">da renda</p>
            </div>
          )}
        </div>

        {income > 0 && (
          <Progress
            value={share}
            className={cn("h-1.5 bg-accent", share >= 90 && "[&>*]:bg-rose-500")}
          />
        )}

        <Separator className="bg-border/30" />

        <div className="space-y-3">
          <Line
            icon={Repeat}
            label="Contas fixas"
            hint={`${c.fixedCount} ativas · ${formatCurrency(c.fixedPending)} a pagar`}
            value={c.fixedTotal}
          />
          <Line
            icon={CreditCard}
            label="Faturas de cartão"
            hint={
              c.invoicesCount === 0
                ? "Nenhum cartão com fatura"
                : `${c.invoicesCount} ${c.invoicesCount === 1 ? "fatura" : "faturas"} · ${formatCurrency(c.invoicesOpen)} em aberto`
            }
            value={c.invoicesTotal}
          />
          {c.debitSubscriptions > 0 && (
            <Line
              icon={Receipt}
              label="Assinaturas no débito"
              hint={`${c.debitSubscriptionsCount} fora de fatura`}
              value={c.debitSubscriptions}
            />
          )}
        </div>

        {c.invoicesTotal > 0 && (
          <>
            <Separator className="bg-border/30" />
            <div className="space-y-1.5 rounded-[12px] bg-accent/10 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Dentro das faturas
              </p>
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Parcelas</span>
                <span className="tabular-nums text-foreground/80">
                  {formatCurrency(c.installmentsInInvoices)}
                </span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">
                  Assinaturas no crédito
                </span>
                <span className="tabular-nums text-foreground/80">
                  {formatCurrency(c.subscriptionsInInvoices)}
                </span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Outras compras</span>
                <span className="tabular-nums text-foreground/80">
                  {formatCurrency(c.otherPurchases)}
                </span>
              </div>
            </div>
          </>
        )}

        {month && (
          <div className="flex items-center gap-2 pt-0.5 text-[11px] text-muted-foreground">
            <Wallet className="size-3.5 shrink-0" />
            Sobram{" "}
            <span className="font-bold tabular-nums text-primary">
              {formatCurrency(Number(month.available_balance))}
            </span>{" "}
            disponíveis para gastar
          </div>
        )}
      </CardContent>
    </Card>
  );
}
