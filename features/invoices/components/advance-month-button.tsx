"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useCurrentMonth } from "@/hooks/use-current-month";
import { monthLabel, nextYearMonth } from "@/lib/dates";
import { monthService } from "@/services/month-service";
import { formatCurrency } from "@/utils/format";

/**
 * Fecha o mês corrente e abre o seguinte.
 *
 * Pede confirmação porque a virada é difícil de desfazer: o mês fechado
 * rejeita novos lançamentos, e o saldo final vira o saldo inicial do próximo.
 */
export function AdvanceMonthButton() {
  const [open, setOpen] = useState(false);
  const { data: month } = useCurrentMonth();
  const queryClient = useQueryClient();

  const advance = useMutation({
    mutationFn: () => monthService.advanceMonth(),
    onSuccess: (next) => {
      queryClient.invalidateQueries();
      setOpen(false);
      toast.success(`${monthLabel(next)} aberto.`);
    },
    onError: (error) => toast.error(error.message),
  });

  if (!month) return null;

  const next = nextYearMonth({ year: month.year, month: month.month });

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <CalendarPlus />
        Novo mês
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Fechar {monthLabel(month).toLowerCase()}?</DialogTitle>
            <DialogDescription>
              O mês vira histórico e deixa de aceitar lançamentos. Os dados
              continuam consultáveis.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5 rounded-[14px] border border-border/40 bg-accent/10 p-3.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Saldo final de hoje</span>
              <span className="font-semibold tabular-nums">
                {formatCurrency(Number(month.bank_balance))}
              </span>
            </div>
            <Separator className="bg-border/30" />
            <p className="font-semibold text-foreground">
              Abre {monthLabel(next).toLowerCase()} com:
            </p>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Saldo inicial</span>
              <span className="font-semibold tabular-nums text-primary">
                {formatCurrency(Number(month.bank_balance))}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Salário (repetido)</span>
              <span className="font-semibold tabular-nums">
                {formatCurrency(Number(month.salary))}
              </span>
            </div>
            <p className="pt-0.5 text-[10px] leading-relaxed text-muted-foreground">
              As faturas da nova competência nascem com as parcelas que caem
              nela e as assinaturas ativas. Extras começam zerados — você ajusta
              salário e entradas depois, se mudarem.
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => advance.mutate()}
              disabled={advance.isPending}
            >
              {advance.isPending ? "Virando…" : `Abrir ${monthLabel(next).split(" ")[0]}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
