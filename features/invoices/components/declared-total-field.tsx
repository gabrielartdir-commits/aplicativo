"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useInvoiceMutations } from "@/hooks/use-card-mutations";
import { round2 } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { formatCurrency, parseCurrencyInput } from "@/utils/format";
import type { InvoiceWithCard } from "@/types/domain";

/**
 * Total real da fatura, lido do extrato.
 *
 * Parcelas e assinaturas já estão dentro desse valor — por isso ele
 * substitui a soma calculada em vez de se somar a ela. A diferença entre o
 * informado e o que o app conhece são as compras avulsas que não foram
 * lançadas aqui.
 */
export function DeclaredTotalField({ invoice }: { invoice: InvoiceWithCard }) {
  const { setDeclaredTotal } = useInvoiceMutations();
  const [value, setValue] = useState("");

  const known = round2(
    Number(invoice.installments_total) + Number(invoice.subscriptions_total)
  );
  const declared =
    invoice.declared_total === null ? null : Number(invoice.declared_total);

  useEffect(() => {
    setValue(declared === null ? "" : String(declared));
  }, [declared]);

  const parsed = value.trim() === "" ? null : parseCurrencyInput(value);
  const invalid = parsed !== null && (Number.isNaN(parsed) || parsed < 0);
  const dirty = (parsed ?? null) !== declared;

  /** O que o extrato tem e o app não conhece. */
  const others = declared === null ? null : round2(declared - known);
  const belowKnown = others !== null && others < 0;

  function save() {
    if (invalid) return;
    setDeclaredTotal.mutate({
      invoiceId: invoice.id,
      declaredTotal: parsed,
    });
  }

  return (
    <div className="space-y-2 rounded-[14px] border border-border/30 bg-accent/5 p-3">
      <Label htmlFor={`inv-${invoice.id}`} className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Valor final da fatura
      </Label>

      <div className="flex items-center gap-2">
        <Input
          id={`inv-${invoice.id}`}
          type="text"
          inputMode="decimal"
          placeholder={`Calculado: ${formatCurrency(known)}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }}
          disabled={invoice.paid}
          className="h-9 text-sm"
        />
        {dirty && !invoice.paid && (
          <>
            <Button
              size="icon-sm"
              aria-label="Salvar valor da fatura"
              onClick={save}
              disabled={invalid || setDeclaredTotal.isPending}
            >
              <Check className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Descartar alteração"
              onClick={() => setValue(declared === null ? "" : String(declared))}
            >
              <X className="size-4" />
            </Button>
          </>
        )}
      </div>

      {invalid && (
        <p className="text-[10px] text-destructive">Informe um valor válido.</p>
      )}

      {declared === null ? (
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Em branco, a fatura vale a soma do que está lançado no app. Informe o
          total do extrato para incluir as compras que você não lançou.
        </p>
      ) : (
        <div className="space-y-1 text-[10px]">
          <div className="flex justify-between text-muted-foreground">
            <span>Parcelas e assinaturas</span>
            <span className="tabular-nums">{formatCurrency(known)}</span>
          </div>
          <div
            className={cn(
              "flex justify-between",
              belowKnown ? "text-destructive" : "text-muted-foreground"
            )}
          >
            <span>Outras compras</span>
            <span className="tabular-nums">{formatCurrency(others ?? 0)}</span>
          </div>
          {belowKnown && (
            <p className="flex items-start gap-1.5 pt-0.5 text-destructive">
              <AlertTriangle className="mt-px size-3 shrink-0" />
              O total informado é menor que as parcelas e assinaturas já
              lançadas. Confira o extrato ou os lançamentos.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
