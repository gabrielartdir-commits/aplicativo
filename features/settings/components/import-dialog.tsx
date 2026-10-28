"use client";

/**
 * Importação da planilha mensal, em dois passos.
 *
 * O primeiro passo é sempre uma CONFERÊNCIA: o app lê o arquivo e mostra o
 * que mudaria — quantas linhas, em que mês, o que será substituído, o que
 * não entendeu e em qual linha. Nada é gravado até o segundo clique.
 *
 * Isso existe porque a planilha é o caminho principal de entrada de dados:
 * uma importação errada em silêncio seria muito pior que um passo a mais.
 */

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/utils/format";
import type { SheetImportReport } from "@/types/sheet";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Quantos erros a tela lista antes de resumir o resto. */
const MAX_ISSUES_SHOWN = 10;

async function send(
  file: File,
  mode: "conferir" | "aplicar",
  ignoreIssues = false
): Promise<SheetImportReport> {
  const form = new FormData();
  form.append("arquivo", file);
  form.append("modo", mode);
  if (ignoreIssues) form.append("ignorarErros", "1");

  const response = await fetch("/api/planilha/importar", {
    method: "POST",
    body: form,
  });
  const data = await response.json();

  /*
   * 422 é "li o arquivo mas não gravei" — o relatório vem no corpo e é
   * exatamente o que a tela precisa mostrar. Só um erro sem relatório é
   * tratado como falha.
   */
  if (!response.ok && !("counts" in data)) {
    throw new Error(data.error ?? "Não consegui ler a planilha.");
  }
  return data as SheetImportReport;
}

/** Linha de contagem, escondida quando o número é zero. */
function Count({ label, value }: { label: string; value: number }) {
  if (value === 0) return null;
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<SheetImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFile(null);
    setReport(null);
    setError(null);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const pick = async (picked: File | null) => {
    setFile(picked);
    setReport(null);
    setError(null);
    if (!picked) return;

    setBusy(true);
    try {
      setReport(await send(picked, "conferir"));
    } catch (problem) {
      setError(
        problem instanceof Error ? problem.message : "Não consegui ler a planilha."
      );
    } finally {
      setBusy(false);
    }
  };

  const apply = async (ignoreIssues: boolean) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const applied = await send(file, "aplicar", ignoreIssues);
      setReport(applied);
      if (applied.applied) {
        // Quase toda tela do app depende de algo que a planilha mexeu.
        queryClient.invalidateQueries();
        toast.success(`Planilha de ${applied.monthLabel} importada.`);
        close(false);
      }
    } catch (problem) {
      setError(
        problem instanceof Error ? problem.message : "Não consegui gravar a planilha."
      );
    } finally {
      setBusy(false);
    }
  };

  const issues = report?.issues ?? [];
  const hasIssues = issues.length > 0;
  const counts = report?.counts;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Importar planilha do mês</DialogTitle>
          <DialogDescription>
            O app lê o arquivo e mostra o que vai mudar antes de gravar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xlsm"
              className="hidden"
              onChange={(event) => pick(event.target.files?.[0] ?? null)}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              <FileSpreadsheet className="mr-2 size-4" />
              {file ? "Escolher outro arquivo" : "Escolher a planilha (.xlsx)"}
            </Button>
            {file && (
              <p className="mt-2 truncate text-xs text-muted-foreground">
                {file.name} · {(file.size / 1024).toFixed(0)} KB
              </p>
            )}
          </div>

          {busy && !report && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Lendo a planilha…
            </p>
          )}

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs leading-relaxed text-rose-200">
              {error}
            </div>
          )}

          {report && counts && (
            <div className="space-y-4 rounded-lg border bg-card/60 p-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-semibold">
                  {report.monthLabel}
                </Badge>
                {report.monthCreated && (
                  <Badge variant="outline" className="text-[10px]">
                    mês novo — será criado
                  </Badge>
                )}
              </div>

              <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                <Count label="Lançamentos" value={counts.lancamentos} />
                <Count label="Contas fixas atualizadas" value={counts.fixosAtualizados} />
                <Count label="Contas fixas novas" value={counts.fixosCriados} />
                <Count label="Contas marcadas como pagas" value={counts.fixosPagos} />
                <Count label="Assinaturas atualizadas" value={counts.assinaturasAtualizadas} />
                <Count label="Assinaturas novas" value={counts.assinaturasCriadas} />
                <Count label="Compras parceladas atualizadas" value={counts.comprasAtualizadas} />
                <Count label="Compras parceladas novas" value={counts.comprasCriadas} />
                <Count label="Cartões atualizados" value={counts.cartoesAtualizados} />
                <Count label="Cartões novos" value={counts.cartoesCriados} />
                <Count label="Categorias novas" value={counts.categoriasCriadas} />
                <Count label="Entradas fixas atualizadas" value={counts.entradasAtualizadas} />
                <Count label="Entradas fixas novas" value={counts.entradasCriadas} />
                <Count label="Aportes" value={counts.aportes} />
                <Count label="Ajustes de saldo" value={counts.ajustes} />
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-1 border-t pt-3 text-xs">
                <span className="text-muted-foreground">
                  Gastos:{" "}
                  <span className="font-semibold text-foreground tabular-nums">
                    {formatCurrency(report.totals.saidas)}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  Receitas:{" "}
                  <span className="font-semibold text-foreground tabular-nums">
                    {formatCurrency(report.totals.entradas)}
                  </span>
                </span>
              </div>

              {report.replaced.lancamentos +
                report.replaced.aportes +
                report.replaced.ajustes +
                report.replaced.pagamentos >
                0 && (
                <p className="border-t pt-3 text-[11px] leading-relaxed text-muted-foreground">
                  Este mês já recebeu uma planilha antes. Saem{" "}
                  {report.replaced.lancamentos} lançamentos,{" "}
                  {report.replaced.aportes} aportes, {report.replaced.ajustes}{" "}
                  ajustes e {report.replaced.pagamentos} pagamentos criados por
                  ela, e entram os desta. O que você lançou à mão no app não é
                  tocado.
                </p>
              )}

              {report.warnings.map((warning) => (
                <p
                  key={warning}
                  className="flex items-start gap-2 border-t pt-3 text-[11px] leading-relaxed text-amber-300/90"
                >
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>{warning}</span>
                </p>
              ))}

              {hasIssues && (
                <div className="space-y-1.5 border-t pt-3">
                  <p className="text-xs font-semibold text-rose-300">
                    {issues.length === 1
                      ? "1 linha com problema"
                      : `${issues.length} linhas com problema`}
                  </p>
                  <ul className="space-y-1">
                    {issues.slice(0, MAX_ISSUES_SHOWN).map((issue, index) => (
                      <li
                        key={`${issue.sheet}-${issue.row}-${index}`}
                        className="text-[11px] leading-relaxed text-muted-foreground"
                      >
                        <span className="font-medium text-foreground">
                          {issue.sheet}
                          {issue.row > 0 ? `, linha ${issue.row}` : ""}:
                        </span>{" "}
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                  {issues.length > MAX_ISSUES_SHOWN && (
                    <p className="text-[11px] text-muted-foreground">
                      e outras {issues.length - MAX_ISSUES_SHOWN}.
                    </p>
                  )}
                </div>
              )}

              {!hasIssues && (
                <p className="flex items-center gap-2 border-t pt-3 text-[11px] text-emerald-400">
                  <CheckCircle2 className="size-3.5" />
                  Nenhum problema encontrado na leitura.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={() => close(false)}>
            Cancelar
          </Button>
          {report && hasIssues && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => apply(true)}
              disabled={busy}
            >
              Importar só as linhas válidas
            </Button>
          )}
          {report && (
            <Button size="sm" onClick={() => apply(false)} disabled={busy || hasIssues}>
              {busy ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" /> Gravando…
                </>
              ) : (
                <>
                  <Upload className="mr-2 size-4" /> Importar {report.monthLabel}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
