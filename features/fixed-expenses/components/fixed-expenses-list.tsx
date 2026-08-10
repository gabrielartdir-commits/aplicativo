"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/shared/empty-state";
import { FixedExpenseDialog } from "@/components/shared/fixed-expense-dialog";
import { useCurrentMonth } from "@/hooks/use-current-month";
import { useFixedExpenses } from "@/hooks/use-fixed-expenses";
import { useFixedExpenseMutations } from "@/hooks/use-fixed-expense-mutations";
import { usePayments } from "@/hooks/use-payments";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils/format";
import type { FixedExpense } from "@/types/domain";
import { useTogglePaid } from "../hooks/use-toggle-paid";

/** Contas recorrentes em débito ou boleto, na linha do tempo de vencimento. */
export function FixedExpensesList() {
  const { data: month } = useCurrentMonth();
  const { data: expenses } = useFixedExpenses();
  const { data: payments } = usePayments(month?.id);
  const { remove } = useFixedExpenseMutations();
  const togglePaid = useTogglePaid();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FixedExpense | null>(null);

  const paidIds = useMemo(
    () => new Set((payments ?? []).map((p) => p.fixed_expense_id)),
    [payments]
  );

  const list = useMemo(
    () => [...(expenses ?? [])].sort((a, b) => a.due_day - b.due_day),
    [expenses]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Saem antes de qualquer decisão de gasto.
        </p>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus />
          Nova conta
        </Button>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="Nenhuma conta fixa cadastrada"
          description="Aluguel, luz, água — cadastre o que se repete todo mês para o cálculo do disponível ficar realista."
        />
      ) : (
        <div className="relative space-y-3 pl-6 before:absolute before:bottom-2 before:left-2.5 before:top-2 before:w-[2px] before:bg-border/30">
          {list.map((expense) => {
            const paid = paidIds.has(expense.id);
            return (
              <div
                key={expense.id}
                className={cn(
                  "relative flex items-center gap-3 rounded-xl border bg-card px-3.5 py-3 transition-all hover:bg-surface-hover/30",
                  (!expense.active || paid) && "opacity-65"
                )}
              >
                <span
                  className={cn(
                    "absolute -left-[20.5px] top-1/2 size-2.5 -translate-y-1/2 rounded-full border-2 bg-background transition-colors",
                    paid ? "border-emerald-500 bg-emerald-500" : "border-warning"
                  )}
                />

                <Checkbox
                  aria-label={`Marcar ${expense.name} como pago`}
                  checked={paid}
                  disabled={!month || !expense.active || togglePaid.isPending}
                  onCheckedChange={(checked) => {
                    if (!month) return;
                    togglePaid.mutate({
                      month,
                      expense,
                      paid: checked === true,
                    });
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-sm font-semibold",
                      paid && "text-muted-foreground line-through"
                    )}
                  >
                    {expense.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Vence dia {expense.due_day}
                  </p>
                </div>
                {!expense.active && <Badge variant="outline">Inativo</Badge>}
                {paid && (
                  <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                    Pago
                  </Badge>
                )}
                <span className="text-sm font-semibold tabular-nums">
                  {formatCurrency(expense.amount)}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Editar"
                    onClick={() => {
                      setEditing(expense);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="size-4 text-muted-foreground hover:text-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Excluir"
                    disabled={paid}
                    onClick={() => {
                      if (window.confirm(`Excluir gasto fixo ${expense.name}?`)) {
                        remove.mutate(expense.id);
                      }
                    }}
                  >
                    <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <FixedExpenseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        expense={editing}
      />
    </div>
  );
}
