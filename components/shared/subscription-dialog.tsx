"use client";

import { useEffect, useMemo } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSubscriptionMutations } from "@/hooks/use-card-mutations";
import { useCreditCards } from "@/hooks/use-cards";
import { useCategories } from "@/hooks/use-categories";
import type { PaymentMethod } from "@/types/database";
import type { SubscriptionWithCard } from "@/types/domain";

const schema = z
  .object({
    name: z.string().min(1, "Informe um nome"),
    amount: z
      .string({ message: "Informe um valor" })
      .transform(parseCurrencyInput)
      .pipe(z.number().positive("O valor deve ser maior que zero")),
    billing_day: z
      .number({ message: "Informe o dia" })
      .int("Dia inválido")
      .min(1, "Entre 1 e 31")
      .max(31, "Entre 1 e 31"),
    payment_method: z.enum(["credit", "debit"]),
    card_id: z.string().nullable(),
    category_id: z.string().nullable(),
    active: z.boolean(),
  })
  .refine((v) => v.payment_method !== "credit" || Boolean(v.card_id), {
    message: "Escolha o cartão da cobrança",
    path: ["card_id"],
  });

type FormValues = z.input<typeof schema>;
type OutputValues = z.output<typeof schema>;

interface SubscriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription: SubscriptionWithCard | null;
}

export function SubscriptionDialog({
  open,
  onOpenChange,
  subscription,
}: SubscriptionDialogProps) {
  const { create, update } = useSubscriptionMutations();
  const { data: cards } = useCreditCards();
  const { data: categories } = useCategories();

  const activeCards = useMemo(
    () => (cards ?? []).filter((c) => c.active),
    [cards]
  );

  const empty = {
    name: "",
    amount: "",
    billing_day: undefined,
    payment_method: "credit" as PaymentMethod,
    card_id: null,
    category_id: null,
    active: true,
  };

  const form = useForm<FormValues, unknown, OutputValues>({
    resolver: zodResolver(schema),
    defaultValues: empty,
  });

  useEffect(() => {
    if (open) {
      form.reset(
        subscription
          ? {
              name: subscription.name,
              amount: String(subscription.amount),
              billing_day: subscription.billing_day,
              payment_method: subscription.payment_method,
              card_id: subscription.card_id,
              category_id: subscription.category_id,
              active: subscription.active,
            }
          : empty
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subscription, form]);

  const method = form.watch("payment_method");

  async function onSubmit(values: OutputValues) {
    const payload = {
      ...values,
      card_id: values.payment_method === "credit" ? values.card_id : null,
    };
    if (subscription) {
      await update.mutateAsync({ id: subscription.id, ...payload });
    } else {
      await create.mutateAsync(payload);
    }
    onOpenChange(false);
  }

  const pending = create.isPending || update.isPending;
  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm rounded-[24px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {subscription ? "Editar assinatura" : "Nova assinatura"}
          </DialogTitle>
          <DialogDescription>
            No crédito, entra na fatura do cartão. No débito, reserva direto do saldo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sub-name">Nome</Label>
            <Input id="sub-name" placeholder="Netflix" {...form.register("name")} />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="sub-amount">Valor mensal</Label>
              <Input
                id="sub-amount"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                {...form.register("amount")}
              />
              {errors.amount && (
                <p className="text-sm text-destructive">{errors.amount.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sub-day">Dia da cobrança</Label>
              <Input
                id="sub-day"
                type="number"
                min="1"
                max="31"
                placeholder="15"
                {...form.register("billing_day", { valueAsNumber: true })}
              />
              {errors.billing_day && (
                <p className="text-sm text-destructive">
                  {errors.billing_day.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Forma de pagamento</Label>
            <Select
              value={method}
              onValueChange={(v) =>
                form.setValue("payment_method", (v ?? "credit") as PaymentMethod)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="credit">Crédito (entra na fatura)</SelectItem>
                <SelectItem value="debit">Débito (reserva do saldo)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {method === "credit" && (
            <div className="space-y-2">
              <Label>Cartão</Label>
              <Select
                value={form.watch("card_id")}
                onValueChange={(v) => form.setValue("card_id", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolha o cartão" />
                </SelectTrigger>
                <SelectContent>
                  {activeCards.map((card) => (
                    <SelectItem key={card.id} value={card.id}>
                      {card.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.card_id && (
                <p className="text-sm text-destructive">
                  {errors.card_id.message}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Categoria (opcional)</Label>
            <Select
              value={form.watch("category_id")}
              onValueChange={(v) => form.setValue("category_id", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sem categoria" />
              </SelectTrigger>
              <SelectContent>
                {(categories ?? []).map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.emoji} {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {subscription && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.watch("active")}
                onCheckedChange={(checked) =>
                  form.setValue("active", checked === true)
                }
              />
              Ativa (entra na fatura do mês)
            </label>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
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
