"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { parseCurrencyInput } from "@/utils/format";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useCreditCardMutations } from "@/hooks/use-card-mutations";
import type { CreditCard } from "@/types/domain";

const schema = z.object({
  name: z.string().min(1, "Informe um nome"),
  closing_day: z
    .number({ message: "Informe o dia" })
    .int("Dia inválido")
    .min(1, "Entre 1 e 31")
    .max(31, "Entre 1 e 31"),
  due_day: z
    .number({ message: "Informe o dia" })
    .int("Dia inválido")
    .min(1, "Entre 1 e 31")
    .max(31, "Entre 1 e 31"),
  // Campo opcional: vazio vale zero, senão parseCurrencyInput devolveria NaN
  // e a validação barraria o cartão sem limite informado.
  credit_limit: z
    .string()
    .transform((v) => (v.trim() === "" ? 0 : parseCurrencyInput(v)))
    .pipe(z.number().min(0, "O limite não pode ser negativo")),
  active: z.boolean(),
});

type FormValues = z.input<typeof schema>;
type OutputValues = z.output<typeof schema>;

interface CreditCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: CreditCard | null;
}

export function CreditCardDialog({
  open,
  onOpenChange,
  card,
}: CreditCardDialogProps) {
  const { create, update } = useCreditCardMutations();

  const empty = {
    name: "",
    closing_day: undefined,
    due_day: undefined,
    credit_limit: "",
    active: true,
  };

  const form = useForm<FormValues, unknown, OutputValues>({
    resolver: zodResolver(schema),
    defaultValues: empty,
  });

  useEffect(() => {
    if (open) {
      form.reset(
        card
          ? {
              name: card.name,
              closing_day: card.closing_day,
              due_day: card.due_day,
              credit_limit: String(card.credit_limit),
              active: card.active,
            }
          : empty
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, card, form]);

  async function onSubmit(values: OutputValues) {
    if (card) {
      await update.mutateAsync({ id: card.id, ...values });
    } else {
      await create.mutateAsync(values);
    }
    onOpenChange(false);
  }

  const pending = create.isPending || update.isPending;
  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm rounded-[24px]">
        <DialogHeader>
          <DialogTitle>{card ? "Editar cartão" : "Novo cartão"}</DialogTitle>
          <DialogDescription>
            O fechamento define em qual fatura a compra cai; o vencimento, quando ela precisa ser paga.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cc-name">Nome</Label>
            <Input id="cc-name" placeholder="Nubank" {...form.register("name")} />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="cc-closing">Dia de fechamento</Label>
              <Input
                id="cc-closing"
                type="number"
                min="1"
                max="31"
                placeholder="28"
                {...form.register("closing_day", { valueAsNumber: true })}
              />
              {errors.closing_day && (
                <p className="text-sm text-destructive">
                  {errors.closing_day.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cc-due">Dia de vencimento</Label>
              <Input
                id="cc-due"
                type="number"
                min="1"
                max="31"
                placeholder="5"
                {...form.register("due_day", { valueAsNumber: true })}
              />
              {errors.due_day && (
                <p className="text-sm text-destructive">
                  {errors.due_day.message}
                </p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cc-limit">Limite (opcional)</Label>
            <Input
              id="cc-limit"
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              {...form.register("credit_limit")}
            />
            {errors.credit_limit && (
              <p className="text-sm text-destructive">
                {errors.credit_limit.message}
              </p>
            )}
          </div>
          {card && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.watch("active")}
                onCheckedChange={(checked) =>
                  form.setValue("active", checked === true)
                }
              />
              Ativo
            </label>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
