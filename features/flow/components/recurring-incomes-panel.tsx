"use client";

import { useEffect, useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  useRecurringIncomeMutations,
  useRecurringIncomes,
} from "@/hooks/use-recurring-incomes";
import { cn } from "@/lib/utils";
import { formatCurrency, parseCurrencyInput } from "@/utils/format";
import type { RecurringIncome } from "@/types/domain";

/** Uma entrada fixa: valor editável no lugar, sem abrir diálogo. */
function IncomeRow({ income }: { income: RecurringIncome }) {
  const { update, remove } = useRecurringIncomeMutations();
  const [value, setValue] = useState(String(income.amount));

  useEffect(() => {
    setValue(String(income.amount));
  }, [income.amount]);

  const parsed = parseCurrencyInput(value);
  const invalid = !Number.isFinite(parsed) || parsed < 0;
  const dirty = !invalid && parsed !== Number(income.amount);

  return (
    <Card className={cn(!income.active && "opacity-55")}>
      <CardContent className="flex items-center gap-3 p-3">
        <Checkbox
          aria-label={`${income.active ? "Desativar" : "Ativar"} ${income.name}`}
          checked={income.active}
          onCheckedChange={(checked) =>
            update.mutate({ id: income.id, active: checked === true })
          }
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{income.name}</p>
          <p className="text-[10px] text-muted-foreground">
            {income.active ? "Entra todo mês" : "Pausada"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Input
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && dirty) {
                e.preventDefault();
                update.mutate({ id: income.id, amount: parsed });
              }
            }}
            aria-label={`Valor de ${income.name}`}
            className="h-8 w-28 text-right text-sm tabular-nums"
          />
          {dirty && (
            <>
              <Button
                size="icon-sm"
                aria-label="Salvar valor"
                disabled={update.isPending}
                onClick={() => update.mutate({ id: income.id, amount: parsed })}
              >
                <Check className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Descartar"
                onClick={() => setValue(String(income.amount))}
              >
                <X className="size-4" />
              </Button>
            </>
          )}
          {!dirty && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remover ${income.name}`}
              onClick={() => {
                if (window.confirm(`Remover a entrada ${income.name}?`)) {
                  remove.mutate(income.id);
                }
              }}
            >
              <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Entradas que se repetem todo mês — os salários da casa. */
export function RecurringIncomesPanel() {
  const { data: incomes } = useRecurringIncomes();
  const { create } = useRecurringIncomeMutations();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const list = incomes ?? [];
  const activeTotal = list
    .filter((i) => i.active)
    .reduce((s, i) => s + Number(i.amount), 0);

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(
      { name: trimmed, amount: 0, sort_order: list.length },
      {
        onSuccess: () => {
          setName("");
          setAdding(false);
        },
      }
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">Entradas fixas</p>
          <p className="text-[10px] text-muted-foreground">
            Somam {formatCurrency(activeTotal)} por mês
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus />
          Nova entrada
        </Button>
      </div>

      {adding && (
        <Card>
          <CardContent className="flex items-center gap-2 p-3">
            <Input
              autoFocus
              placeholder="Nome da entrada"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
                if (e.key === "Escape") setAdding(false);
              }}
              className="h-8 text-sm"
            />
            <Button size="sm" onClick={submit} disabled={create.isPending}>
              Adicionar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setName("");
                setAdding(false);
              }}
            >
              Cancelar
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {list.map((income) => (
          <IncomeRow key={income.id} income={income} />
        ))}
      </div>

      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Alterar um valor ajusta o saldo do mês corrente na hora. Na virada do
        mês, o salário do novo mês vem da soma das entradas ativas.
      </p>
    </div>
  );
}
