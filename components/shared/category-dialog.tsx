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
import { useCategoryMutations } from "@/hooks/use-category-mutations";
import { EmojiPicker } from "./emoji-picker";
import type { Category } from "@/types/domain";

const schema = z.object({
  /** Vazio significa categoria sem emoji — escolha válida, não erro. */
  emoji: z.string().max(8, "Use um único emoji"),
  name: z.string().min(1, "Informe um nome"),
  default_limit: z
    .string({ message: "Informe um limite" })
    .transform(parseCurrencyInput)
    .pipe(z.number().nonnegative("O limite não pode ser negativo")),
});

type FormValues = z.input<typeof schema>;
type OutputValues = z.output<typeof schema>;

interface CategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preenchida para edição; null para criação. */
  category: Category | null;
  /** sort_order atribuído a novas categorias. */
  nextSortOrder?: number;
}

export function CategoryDialog({
  open,
  onOpenChange,
  category,
  nextSortOrder = 0,
}: CategoryDialogProps) {
  const { create, update } = useCategoryMutations();

  const form = useForm<FormValues, unknown, OutputValues>({
    resolver: zodResolver(schema),
    defaultValues: { emoji: "", name: "", default_limit: "" },
  });

  useEffect(() => {
    if (open) {
      form.reset(
        category
          ? {
              emoji: category.emoji,
              name: category.name,
              default_limit: String(category.default_limit),
            }
          : { emoji: "", name: "", default_limit: "" }
      );
    }
  }, [open, category, form]);

  async function onSubmit(values: OutputValues) {
    if (category) {
      await update.mutateAsync({ id: category.id, ...values });
    } else {
      await create.mutateAsync({ ...values, sort_order: nextSortOrder });
    }
    onOpenChange(false);
  }

  const pending = create.isPending || update.isPending;
  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={(o) => onOpenChange(o)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {category ? "Editar categoria" : "Nova categoria"}
          </DialogTitle>
          <DialogDescription>
            Limites de planejamento — categorias não reservam dinheiro.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-[92px_1fr] gap-3">
            <div className="space-y-2">
              <Label htmlFor="cat-emoji">Emoji</Label>
              <EmojiPicker
                id="cat-emoji"
                value={form.watch("emoji")}
                onChange={(emoji) => form.setValue("emoji", emoji)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-name">Nome</Label>
              <Input
                id="cat-name"
                placeholder="Alimentação"
                {...form.register("name")}
              />
            </div>
          </div>
          {(errors.emoji || errors.name) && (
            <p className="text-sm text-destructive">
              {errors.emoji?.message ?? errors.name?.message}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="cat-limit">Limite mensal</Label>
            <Input
              id="cat-limit"
              type="text"
              inputMode="decimal"
              min="0"
              placeholder="800,00"
              {...form.register("default_limit")}
            />
            {errors.default_limit && (
              <p className="text-sm text-destructive">
                {errors.default_limit.message}
              </p>
            )}
          </div>
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
