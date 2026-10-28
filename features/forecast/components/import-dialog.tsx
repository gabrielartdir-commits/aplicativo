"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useForecastMutations } from "@/hooks/use-forecast";
import { formatCurrency } from "@/utils/format";
import type { ForecastImportReport } from "@/types/forecast";

/** Quantos erros aparecem na lista antes de resumir o resto. */
const ISSUES_SHOWN = 8;

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Importação da planilha em dois passos: conferir e aplicar.
 *
 * O primeiro envio é sempre uma conferência — o app lê o arquivo e diz o que
 * vai mudar (quantas linhas, quais meses, quanto seria substituído) antes de
 * gravar. Como a importação substitui os meses presentes no arquivo, ver isso
 * antes evita apagar um mês por engano.
 */
export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { invalidate } = useForecastMutations();

  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ForecastImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"conferir" | "aplicar" | null>(null);

  function reset() {
    setFile(null);
    setReport(null);
    setError(null);
    setBusy(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function send(
    chosen: File,
    mode: "conferir" | "aplicar",
    ignoreIssues = false
  ) {
    setBusy(mode);
    setError(null);

    const body = new FormData();
    body.append("arquivo", chosen);
    body.append("modo", mode);
    if (ignoreIssues) body.append("ignorarErros", "1");

    try {
      const res = await fetch("/api/proximos-meses/importar", {
        method: "POST",
        body,
      });
      const data = await res.json();

      // 422 traz o relatório com os erros — é resposta útil, não falha.
      if (!res.ok && res.status !== 422) {
        throw new Error(data?.error ?? "Não consegui ler a planilha.");
      }

      setReport(data as ForecastImportReport);

      if ((data as ForecastImportReport).applied) {
        invalidate();
        toast.success(
          `Previsão atualizada: ${(data as ForecastImportReport).entries} linhas em ${(data as ForecastImportReport).competences.length} ${
            (data as ForecastImportReport).competences.length === 1 ? "mês" : "meses"
          }.`
        );
        onOpenChange(false);
        reset();
      }
    } catch (caught) {
      setReport(null);
      setError(
        caught instanceof Error ? caught.message : "Não consegui ler a planilha."
      );
    } finally {
      setBusy(null);
    }
  }

  function pick(chosen: File | null) {
    setReport(null);
    setError(null);
    setFile(chosen);
    if (chosen) void send(chosen, "conferir");
  }

  const issues = report?.issues ?? [];
  const canApply = report !== null && report.entries > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Importar planilha dos próximos meses</DialogTitle>
          <DialogDescription>
            Os meses que estiverem no arquivo são substituídos pelo conteúdo
            dele. Os outros meses ficam como estão.
          </DialogDescription>
        </DialogHeader>

        {/* Passo 1 — o padrão */}
        <div className="space-y-2 rounded-[14px] border border-border/40 bg-card/40 p-3">
          <p className="text-xs font-semibold">1. Comece pelo modelo</p>
          {/* Âncora de verdade, não botão: o nome do arquivo vem do
              Content-Disposition da rota, e o navegador cuida do download. */}
          <div className="flex flex-wrap gap-2">
            <a
              href="/api/proximos-meses/modelo"
              download
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Download className="size-4 mr-2" /> Modelo em branco
            </a>
            <a
              href="/api/proximos-meses/modelo?preencher=1"
              download
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <FileSpreadsheet className="size-4 mr-2" /> Modelo já preenchido
            </a>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            O preenchido já traz os próximos 12 meses com as contas fixas,
            assinaturas, parcelas e entradas que o app conhece — é só conferir e
            completar. A aba <span className="font-medium">Como preencher</span>{" "}
            explica cada coluna.
          </p>
        </div>

        {/* Passo 2 — o arquivo */}
        <div className="space-y-2 rounded-[14px] border border-border/40 bg-card/40 p-3">
          <p className="text-xs font-semibold">2. Envie a planilha preenchida</p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xlsm"
            className="hidden"
            onChange={(event) => pick(event.target.files?.[0] ?? null)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={busy !== null}
            >
              <Upload className="size-4 mr-2" />
              {file ? "Trocar arquivo" : "Escolher arquivo"}
            </Button>
            {file && (
              <span className="truncate text-xs text-muted-foreground">
                {file.name}
              </span>
            )}
          </div>
          {busy === "conferir" && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <RefreshCw className="size-3.5 animate-spin" /> Lendo a planilha…
            </p>
          )}
        </div>

        {error && (
          <div className="flex gap-2 rounded-[14px] border border-rose-500/30 bg-rose-500/5 p-3 text-xs leading-relaxed text-rose-300">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {report && (
          <div className="space-y-3 rounded-[14px] border border-border/40 bg-card/40 p-3">
            <p className="flex items-center gap-2 text-xs font-semibold">
              <CheckCircle2 className="size-4 text-primary" />
              O que vai acontecer
            </p>

            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Linhas lidas</dt>
                <dd className="font-semibold tabular-nums">{report.entries}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Meses no arquivo</dt>
                <dd className="font-semibold tabular-nums">
                  {report.competences.length > 0
                    ? `${report.competences.length} · ${report.competences[0]}${
                        report.competences.length > 1
                          ? ` → ${report.competences[report.competences.length - 1]}`
                          : ""
                      }`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Saídas previstas</dt>
                <dd className="font-semibold tabular-nums text-rose-300">
                  {formatCurrency(report.totals.saidas)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Entradas previstas</dt>
                <dd className="font-semibold tabular-nums text-emerald-300">
                  {formatCurrency(report.totals.entradas)}
                </dd>
              </div>
            </dl>

            {report.replaced > 0 && (
              <p className="text-[11px] leading-relaxed text-amber-300">
                {report.replaced}{" "}
                {report.replaced === 1 ? "linha já gravada" : "linhas já gravadas"}{" "}
                nesses meses {report.replaced === 1 ? "será" : "serão"} substituída
                {report.replaced === 1 ? "" : "s"} pelo arquivo.
              </p>
            )}

            {report.skipped > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {report.skipped} linha(s) em branco ignorada(s).
              </p>
            )}

            {issues.length > 0 && (
              <div className="space-y-1.5 rounded-[12px] border border-amber-500/30 bg-amber-500/5 p-2.5">
                <p className="flex items-center gap-2 text-[11px] font-semibold text-amber-300">
                  <AlertTriangle className="size-3.5" />
                  {issues.length}{" "}
                  {issues.length === 1 ? "linha com problema" : "linhas com problema"}
                </p>
                <ul className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
                  {issues.slice(0, ISSUES_SHOWN).map((issue) => (
                    <li key={issue.row}>
                      <span className="font-medium text-foreground">
                        Linha {issue.row}:
                      </span>{" "}
                      {issue.message}
                    </li>
                  ))}
                  {issues.length > ISSUES_SHOWN && (
                    <li>e mais {issues.length - ISSUES_SHOWN}.</li>
                  )}
                </ul>
                <p className="text-[11px] text-muted-foreground">
                  Corrija na planilha e envie de novo, ou importe só as linhas
                  válidas.
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                disabled={!canApply || busy !== null || issues.length > 0}
                onClick={() => file && send(file, "aplicar")}
              >
                {busy === "aplicar" ? (
                  <>
                    <RefreshCw className="size-4 mr-2 animate-spin" /> Gravando…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="size-4 mr-2" /> Importar{" "}
                    {report.entries} linhas
                  </>
                )}
              </Button>
              {issues.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canApply || busy !== null}
                  onClick={() => file && send(file, "aplicar", true)}
                >
                  Importar só as {report.entries} válidas
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
