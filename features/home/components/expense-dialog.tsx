"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { parseCurrencyInput } from "@/utils/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toISODate } from "@/lib/dates";
import type { Category, Month } from "@/types/domain";
import { useRegisterExpense } from "../hooks/use-register-expense";

const schema = z.object({
  amount: z
    .string({ message: "Informe um valor" })
    .transform(parseCurrencyInput)
    .pipe(z.number().positive("O valor deve ser maior que zero")),
  /** Vazio registra o gasto sem categoria — classificar é opcional. */
  categoryId: z.string(),
  description: z.string(),
  date: z.string().min(1, "Informe a data"),
});

type FormValues = z.input<typeof schema>;
type OutputValues = z.output<typeof schema>;

interface ExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: Month;
  categories: Category[];
}

export function ExpenseDialog({
  open,
  onOpenChange,
  month,
  categories,
}: ExpenseDialogProps) {
  const registerExpense = useRegisterExpense();

  const form = useForm<FormValues, unknown, OutputValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: "",
      categoryId: "",
      description: "",
      date: toISODate(),
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        amount: "",
        categoryId: "",
        description: "",
        date: toISODate(),
      });
    }
  }, [open, form]);

  const selectItems = categories.map((c) => ({
    value: c.id,
    label: `${c.emoji} ${c.name}`,
  }));

  async function onSubmit(values: OutputValues) {
    await registerExpense.mutateAsync({
      month,
      amount: values.amount,
      categoryId: values.categoryId || null,
      description: values.description,
      date: values.date,
    });
    onOpenChange(false);
  }

  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={(o) => onOpenChange(o)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar gasto</DialogTitle>
          <DialogDescription>
            O valor sai do saldo bancário e do disponível.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="exp-amount">Valor</Label>
              <Input
                id="exp-amount"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                autoFocus
                {...form.register("amount")}
              />
              {errors.amount && (
                <p className="text-sm text-destructive">
                  {errors.amount.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="exp-date">Data</Label>
              <Input id="exp-date" type="date" {...form.register("date")} />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Categoria</Label>
              {form.watch("categoryId") && (
                <button
                  type="button"
                  onClick={() => form.setValue("categoryId", "")}
                  className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  Limpar
                </button>
              )}
            </div>
            <Select
              items={selectItems}
              value={form.watch("categoryId") || null}
              onValueChange={(value) =>
                form.setValue("categoryId", (value as string) ?? "")
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sem categoria (opcional)" />
              </SelectTrigger>
              <SelectContent>
                {selectItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="exp-description">Descrição</Label>
            <Input
              id="exp-description"
              placeholder="Ex.: mercado da semana"
              {...form.register("description")}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={registerExpense.isPending}>
              Salvar gasto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
