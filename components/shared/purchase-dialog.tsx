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
import {
  installmentCompetences,
  round2,
  splitInstallments,
} from "@/lib/finance";
import { useCurrentMonth } from "@/hooks/use-current-month";
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
  current_installment: z
    .number({ message: "Informe a parcela atual" })
    .int("Número inválido")
    .min(1, "No mínimo 1")
    .max(120, "No máximo 120"),
  purchase_date: z.string().min(1, "Informe a data"),
})
  .refine((v) => v.current_installment <= v.installments_count, {
    message: "Não pode ser maior que o total de parcelas",
    path: ["current_installment"],
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
  const { data: month } = useCurrentMonth();

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
    current_installment: 1,
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
  const watchedCurrent = form.watch("current_installment");
  const watchedDate = form.watch("purchase_date");
  const watchedCard = form.watch("card_id");

  /**
   * Prévia ao vivo. A primeira competência respeita o fechamento do cartão:
   * comprar depois do fechamento joga tudo para a fatura seguinte.
   */
  const preview = useMemo(() => {
    const total = parseCurrencyInput(String(watchedTotal ?? ""));
    const count = Number(watchedCount);
    const currentNo = Number(watchedCurrent);
    if (!total || total <= 0 || !count || count < 1 || count > 120) return null;
    if (!currentNo || currentNo < 1 || currentNo > count) return null;

    const card = activeCards.find((c) => c.id === watchedCard);
    if (!card || !watchedDate) return null;

    // O valor da parcela sai do total original dividido por todas as parcelas.
    const parts = splitInstallments(total, count);
    const remaining = parts.slice(currentNo - 1);

    const inProgress = currentNo > 1;
    const first =
      inProgress && month
        ? { year: month.year, month: month.month }
        : competenceForPurchase(watchedDate, card.closing_day);
    const competences = installmentCompetences(
      first.year,
      first.month,
      remaining.length
    );
    const purchaseDay = new Date(`${watchedDate}T00:00:00`).getDate();

    return {
      installment: remaining[0],
      last: remaining[remaining.length - 1],
      uneven: remaining[0] !== remaining[remaining.length - 1],
      count,
      remainingCount: remaining.length,
      remainingTotal: round2(remaining.reduce((a, b) => a + b, 0)),
      startsAt: shortCompetenceLabel(competences[0]),
      endsAt: shortCompetenceLabel(competences[competences.length - 1]),
      inProgress,
      alreadyPaid: currentNo - 1,
      shifted: !inProgress && purchaseDay > card.closing_day,
      closingDay: card.closing_day,
    };
  }, [
    watchedTotal,
    watchedCount,
    watchedCurrent,
    watchedDate,
    watchedCard,
    activeCards,
    month,
  ]);

  async function onSubmit(values: OutputValues) {
    await create.mutateAsync({
      cardId: values.card_id,
      categoryId: values.category_id,
      description: values.description,
      totalAmount: values.total_amount,
      installmentsCount: values.installments_count,
      currentInstallment: values.current_installment,
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
                <Label htmlFor="pu-count">Total de parcelas</Label>
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
              <Label htmlFor="pu-current">Parcela atual</Label>
              <Input
                id="pu-current"
                type="number"
                min="1"
                max="120"
                {...form.register("current_installment", {
                  valueAsNumber: true,
                })}
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Deixe 1 para uma compra nova. Se o parcelamento já começou,
                informe a parcela que está vencendo agora — as anteriores não
                entram no app.
              </p>
              {errors.current_installment && (
                <p className="text-sm text-destructive">
                  {errors.current_installment.message}
                </p>
              )}
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
                  {preview.count}x de {formatCurrency(preview.installment)}
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
                {preview.inProgress && (
                  <p className="text-muted-foreground">
                    {preview.alreadyPaid} parcela
                    {preview.alreadyPaid > 1 ? "s" : ""} já paga
                    {preview.alreadyPaid > 1 ? "s" : ""} — entram{" "}
                    <span className="font-semibold text-foreground">
                      {preview.remainingCount} de {preview.count}
                    </span>
                    , somando{" "}
                    <span className="font-semibold text-foreground">
                      {formatCurrency(preview.remainingTotal)}
                    </span>
                  </p>
                )}
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
