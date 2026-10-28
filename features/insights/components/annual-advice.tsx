"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Markdown } from "./markdown";

interface AdviceResponse {
  reply: string;
  geradoEm: string;
}

/**
 * Consultoria sobre o ano inteiro.
 *
 * Não manda contexto: a rota monta o retrato no servidor, lendo o banco. A tela
 * só pede e mostra.
 */
export function AnnualAdvice() {
  const [advice, setAdvice] = useState<AdviceResponse | null>(null);

  const analyze = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/consultoria", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao analisar.");
      return data as AdviceResponse;
    },
    onSuccess: setAdvice,
  });

  return (
    <Card>
      <CardContent className="space-y-4 p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="size-4" />
              </span>
              <h2 className="text-sm font-semibold">Consultoria do ano</h2>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Lê o fluxo de todos os meses, as parcelas, as faturas e os aportes.
            </p>
          </div>
          <Button
            size="sm"
            variant={advice ? "outline" : "default"}
            onClick={() => analyze.mutate()}
            disabled={analyze.isPending}
          >
            {analyze.isPending ? (
              <>
                <RefreshCw className="animate-spin" />
                Analisando o ano…
              </>
            ) : (
              <>
                <Sparkles />
                {advice ? "Analisar de novo" : "Analisar meu ano"}
              </>
            )}
          </Button>
        </div>

        {analyze.isError && (
          <div className="flex items-start gap-2 rounded-[12px] border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>{analyze.error.message}</span>
          </div>
        )}

        {advice ? (
          <>
            <Markdown content={advice.reply} />
            <p className="border-t pt-3 text-[10px] leading-relaxed text-muted-foreground">
              Análise de organização do orçamento, gerada em{" "}
              {advice.geradoEm.split("-").reverse().join("/")}. Não é
              recomendação de investimento: para escolher onde investir, procure
              um profissional certificado.
            </p>
          </>
        ) : (
          !analyze.isPending && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              A análise do mês olha o que merece atenção agora. Esta olha o ano:
              quanto da sua renda fica de fato, para onde o dinheiro vai, quanto
              o crédito custa por mês e quando cada parcela libera folga.
            </p>
          )
        )}
      </CardContent>
    </Card>
  );
}
