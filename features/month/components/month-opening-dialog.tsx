"use client";

import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useFixedExpenses } from "@/hooks/use-fixed-expenses";
import { useVault } from "@/hooks/use-vault";
import { useRecurringIncomes } from "@/hooks/use-recurring-incomes";
import { currentYearMonth, monthLabel } from "@/lib/dates";
import { computeMonthOpening } from "@/lib/finance";
import { queryKeys } from "@/lib/query-keys";
import { monthService } from "@/services/month-service";
import { formatCurrency, parseCurrencyInput } from "@/utils/format";

const openingSchema = z.object({
  startingBalance: z
    .string({ message: "Informe um valor válido" })
    .transform(parseCurrencyInput)
    .pipe(z.number().min(0, "Informe um valor válido")),
  salary: z
    .string({ message: "Informe um valor válido" })
    .transform(parseCurrencyInput)
    .pipe(z.number().min(0, "Informe um valor válido")),
  extraIncome: z
    .string({ message: "Informe um valor válido" })
    .transform(parseCurrencyInput)
    .pipe(z.number().min(0, "Informe um valor válido")),
});

type OpeningForm = z.input<typeof openingSchema>;
type OpeningOutput = z.output<typeof openingSchema>;

export function MonthOpeningDialog() {
  const queryClient = useQueryClient();
  const now = currentYearMonth();

  const { data: vault } = useVault();
  const { data: fixedExpenses } = useFixedExpenses();
  const { data: previousBalance } = useQuery({
    queryKey: [...queryKeys.months, "previous-balance"],
    queryFn: () => monthService.getPreviousMonthBalance(),
  });

  const form = useForm<OpeningForm, unknown, OpeningOutput>({
    resolver: zodResolver(openingSchema),
    defaultValues: { startingBalance: "0", salary: "0", extraIncome: "0" },
  });

  useEffect(() => {
    if (previousBalance != null) {
      form.setValue("startingBalance", String(previousBalance));
    }
  }, [previousBalance, form]);

  /** Sugere como salário a soma das entradas fixas já cadastradas. */
  const { data: recurringIncomes } = useRecurringIncomes();
  const recurringTotal = useMemo(
    () =>
      (recurringIncomes ?? [])
        .filter((i) => i.active)
        .reduce((sum, i) => sum + Number(i.amount), 0),
    [recurringIncomes]
  );

  useEffect(() => {
    if (recurringTotal > 0) {
      form.setValue("salary", String(recurringTotal));
    }
  }, [recurringTotal, form]);

  const values = form.watch();
  const fixedTotal = useMemo(
    () =>
      (fixedExpenses ?? [])
        .filter((f) => f.active)
        .reduce((sum, f) => sum + f.amount, 0),
    [fixedExpenses]
  );

  const preview = computeMonthOpening({
    startingBalance: parseCurrencyInput(String(values.startingBalance)) || 0,
    salary: parseCurrencyInput(String(values.salary)) || 0,
    extraIncome: parseCurrencyInput(String(values.extraIncome)) || 0,
    fixedExpensesTotal: fixedTotal,
    investmentGoal: vault?.investment_goal ?? 0,
  });

  const openMonth = useMutation({
    mutationFn: (input: OpeningOutput) =>
      monthService.openMonth({
        startingBalance: input.startingBalance,
        salary: input.salary,
        extraIncome: input.extraIncome,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.currentMonth });
      queryClient.invalidateQueries({ queryKey: queryKeys.months });
      toast.success(`${monthLabel(now)} aberto.`);
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-6 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="w-full max-w-md rounded-xl border bg-card p-8"
      >
        <span className="mb-5 flex size-11 items-center justify-center rounded-xl bg-primary">
          <CalendarPlus className="size-5 text-primary-foreground" />
        </span>
        <h1 className="text-lg font-semibold tracking-tight">
          Abrir {monthLabel(now)}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Confirme os valores para calcular seu dinheiro disponível.
        </p>

        <form
          onSubmit={form.handleSubmit((data) => openMonth.mutate(data))}
          className="mt-6 space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="startingBalance">Saldo restante do mês anterior</Label>
            <Input
              id="startingBalance"
              type="text"
              inputMode="decimal"
              {...form.register("startingBalance")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="salary">Salário recebido</Label>
            <Input
              id="salary"
              type="text"
              inputMode="decimal"
              {...form.register("salary")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="extraIncome">Receitas extras</Label>
            <Input
              id="extraIncome"
              type="text"
              inputMode="decimal"
              {...form.register("extraIncome")}
            />
          </div>

          <Separator />

          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Saldo bancário</dt>
              <dd className="tabular-nums">
                {formatCurrency(preview.bank_balance)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Reserva de gastos fixos</dt>
              <dd className="tabular-nums">
                − {formatCurrency(preview.reserved_fixed_expenses)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Reserva de investimento</dt>
              <dd className="tabular-nums">
                − {formatCurrency(preview.reserved_investment)}
              </dd>
            </div>
            <div className="flex justify-between pt-1 font-medium">
              <dt>Disponível para gastar</dt>
              <dd className="tabular-nums text-emerald-400">
                {formatCurrency(preview.available_balance)}
              </dd>
            </div>
          </dl>

          <Button
            type="submit"
            className="w-full"
            disabled={openMonth.isPending}
          >
            Confirmar e abrir o mês
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
