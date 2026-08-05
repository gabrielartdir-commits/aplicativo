"use client";

import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatCurrency, parseCurrencyInput } from "@/utils/format";
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
import { usePurchaseMutations } from "@/hooks/use-card-mutations";
import { useCreditCards } from "@/hooks/use-cards";
import { useCategories } from "@/hooks/use-categories";
import { installmentCompetences, splitInstallments } from "@/lib/finance";
import {
  competenceForPurchase,
  shortCompetenceLabel,
  toISODate,
} from "@/lib/dates";

const schema = z.object({
  card_id: z.string().min(1, "Escolha o cartão"),
  category_id: z.string().nullable(),
  description: z.string().min(1, "Descreva a compra"),
  total_amount: z
    .string({ message: "Informe um valor" })
    .transform(parseCurrencyInput)
    .pipe(z.number().positive("O valor deve ser maior que zero")),
  installments_count: z
    .number({ message: "Informe as parcelas" })
    .int("Número inválido")
    .min(1, "No mínimo 1")
    .max(120, "No máximo 120"),
  purchase_date: z.string().min(1, "Informe a data"),
});

type FormValues = z.input<typeof schema>;
type OutputValues = z.output<typeof schema>;

interface PurchaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PurchaseDialog({ open, onOpenChange }: PurchaseDialogProps) {
  const { create } = usePurchaseMutations();
  const { data: cards } = useCreditCards();
  const { data: categories } = useCategories();

  const activeCards = useMemo(
    () => (cards ?? []).filter((c) => c.active),
    [cards]
  );

  /** O Select precisa de `items` para exibir o rótulo no gatilho, não o valor. */
  const cardItems = useMemo(
    () => activeCards.map((c) => ({ value: c.id, label: c.name })),
    [activeCards]
  );

  const categoryItems = useMemo(
    () =>
      (categories ?? []).map((c) => ({
        value: c.id,
        label: `${c.emoji} ${c.name}`,
      })),
    [categories]
  );

  const empty = {
    card_id: "",
    category_id: null,
    description: "",
    total_amount: "",
    installments_count: 1,
    purchase_date: toISODate(),
  };

  const form = useForm<FormValues, unknown, OutputValues>({
    resolver: zodResolver(schema),
    defaultValues: empty,
  });

  useEffect(() => {
    if (open) form.reset(empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form]);

  const watchedTotal = form.watch("total_amount");
  const watchedCount = form.watch("installments_count");
  const watchedDate = form.watch("purchase_date");
  const watchedCard = form.watch("card_id");

  /**
   * Prévia ao vivo. A primeira competência respeita o fechamento do cartão:
   * comprar depois do fechamento joga tudo para a fatura seguinte.
   */
  const preview = useMemo(() => {
    const total = parseCurrencyInput(String(watchedTotal ?? ""));
    const count = Number(watchedCount);
    if (!total || total <= 0 || !count || count < 1 || count > 120) return null;

    const card = activeCards.find((c) => c.id === watchedCard);
    if (!card || !watchedDate) return null;

    const parts = splitInstallments(total, count);
    const first = competenceForPurchase(watchedDate, card.closing_day);
    const competences = installmentCompetences(first.year, first.month, count);
    const purchaseDay = new Date(`${watchedDate}T00:00:00`).getDate();

    return {
      first: parts[0],
      last: parts[count - 1],
      uneven: parts[0] !== parts[count - 1],
      endsAt: shortCompetenceLabel(competences[count - 1]),
      startsAt: shortCompetenceLabel(competences[0]),
      shifted: purchaseDay > card.closing_day,
      closingDay: card.closing_day,
    };
  }, [watchedTotal, watchedCount, watchedDate, watchedCard, activeCards]);

  async function onSubmit(values: OutputValues) {
    await create.mutateAsync({
      cardId: values.card_id,
      categoryId: values.category_id,
      description: values.description,
      totalAmount: values.total_amount,
      installmentsCount: values.installments_count,
      purchaseDate: values.purchase_date,
    });
    onOpenChange(false);
  }

  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-[24px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova compra no cartão</DialogTitle>
          <DialogDescription>
            Só a parcela do mês entra no seu disponível. As demais aparecem no calendário.
          </DialogDescription>
        </DialogHeader>

        {activeCards.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Cadastre um cartão antes de lançar uma compra.
          </p>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pu-desc">Descrição</Label>
              <Input
                id="pu-desc"
                placeholder="Monitor 27 polegadas"
                {...form.register("description")}
              />
              {errors.description && (
                <p className="text-sm text-destructive">
                  {errors.description.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Cartão</Label>
              <Select
                items={cardItems}
                value={form.watch("card_id") || null}
                onValueChange={(v) =>
                  form.setValue("card_id", (v as string) ?? "", {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Escolha o cartão" />
                </SelectTrigger>
                <SelectContent>
                  {cardItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="pu-total">Valor total</Label>
                <Input
                  id="pu-total"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  {...form.register("total_amount")}
                />
                {errors.total_amount && (
                  <p className="text-sm text-destructive">
                    {errors.total_amount.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="pu-count">Parcelas</Label>
                <Input
                  id="pu-count"
                  type="number"
                  min="1"
                  max="120"
                  {...form.register("installments_count", {
                    valueAsNumber: true,
                  })}
                />
                {errors.installments_count && (
                  <p className="text-sm text-destructive">
                    {errors.installments_count.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pu-date">Data da compra</Label>
              <Input id="pu-date" type="date" {...form.register("purchase_date")} />
              {errors.purchase_date && (
                <p className="text-sm text-destructive">
                  {errors.purchase_date.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Categoria (opcional)</Label>
              <Select
                items={categoryItems}
                value={form.watch("category_id")}
                onValueChange={(v) =>
                  form.setValue("category_id", (v as string) ?? null)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sem categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categoryItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {preview && (
              <div className="rounded-[16px] border border-primary/15 bg-primary/5 p-3.5 text-xs space-y-1.5">
                <p className="font-semibold text-foreground">
                  {watchedCount}x de {formatCurrency(preview.first)}
                  {preview.uneven && (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      (última de {formatCurrency(preview.last)})
                    </span>
                  )}
                </p>
                <p className="text-muted-foreground">
                  De {preview.startsAt} até{" "}
                  <span className="font-semibold text-foreground">
                    {preview.endsAt}
                  </span>
                </p>
                {preview.shifted && (
                  <p className="text-amber-400">
                    Compra após o fechamento (dia {preview.closingDay}) — cai na
                    fatura seguinte.
                  </p>
                )}
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={create.isPending}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
