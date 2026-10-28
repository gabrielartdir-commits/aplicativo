"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import {
  PiggyBank,
  Vault as VaultIcon,
  RefreshCw,
  Calculator,
  Lock,
  Download,
  FileSpreadsheet,
  FileDown,
  Upload,
  Sun,
  Moon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/layout/page-header";
import { useVault } from "@/hooks/use-vault";
import { useCurrentMonth } from "@/hooks/use-current-month";
import { useSheetImports } from "@/hooks/use-sheet-imports";
import { queryKeys } from "@/lib/query-keys";
import { vaultRepository } from "@/services/repositories/vault-repository";
import { monthService } from "@/services/month-service";
import { monthRepository } from "@/services/repositories/month-repository";
import { formatCurrency, formatDate, parseCurrencyInput } from "@/utils/format";
import { ImportDialog } from "./import-dialog";

export function SettingsView() {
  const queryClient = useQueryClient();
  const { data: vault } = useVault();
  const { data: currentMonth } = useCurrentMonth();
  const { data: sheetImports } = useSheetImports();
  const { theme, setTheme } = useTheme();
  const [importOpen, setImportOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const [goal, setGoal] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (vault) setGoal(String(vault.investment_goal));
  }, [vault]);

  const saveGoal = useMutation({
    mutationFn: async () => {
      if (!vault) throw new Error("Vault não encontrado.");
      const value = parseCurrencyInput(goal);
      if (Number.isNaN(value) || value < 0) {
        throw new Error("Informe um valor válido.");
      }
      await Promise.all([
        vaultRepository.updateInvestmentGoal(vault.id, value),
        monthService.updateCurrentMonthInvestmentGoal(value),
      ]);
      window.localStorage.setItem("budgetos.recurring-investment", JSON.stringify({
        name: "Investimento mensal",
        value: value,
        status: value > 0 ? "active" : "paused",
      }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vault });
      queryClient.invalidateQueries({ queryKey: queryKeys.currentMonth });
      queryClient.invalidateQueries({ queryKey: queryKeys.months });
      toast.success("Meta de investimento atualizada.");
    },
    onError: (error) => toast.error(error.message),
  });

  const [exporting, setExporting] = useState(false);

  /**
   * Baixa um .xlsx montado no servidor.
   *
   * O arquivo vem como anexo e o nome sai do Content-Disposition, com a data
   * ou a competência dentro. O link temporário é revogado depois para não
   * segurar memória.
   */
  const downloadSpreadsheet = async (
    endpoint: string,
    fallbackName: string
  ) => {
    const res = await fetch(endpoint);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Falha ao gerar a planilha.");
    }

    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] ?? fallbackName;

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    return filename;
  };

  const exportSpreadsheet = async () => {
    setExporting(true);
    try {
      const filename = await downloadSpreadsheet(
        "/api/exportar",
        "budgetos.xlsx"
      );
      toast.success(`Planilha gerada: ${filename}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Falha ao gerar a planilha."
      );
    } finally {
      setExporting(false);
    }
  };

  /** O modelo da planilha mensal, com o cadastro atual já dentro. */
  const downloadTemplate = async (empty: boolean) => {
    setDownloading(true);
    try {
      const filename = await downloadSpreadsheet(
        `/api/planilha/modelo${empty ? "?vazio=1" : ""}`,
        "budgetos-modelo.xlsx"
      );
      toast.success(`Modelo gerado: ${filename}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Falha ao gerar o modelo."
      );
    } finally {
      setDownloading(false);
    }
  };

  /**
   * Reconstrói saldo e reservas a partir dos registros, sem apagar nada.
   * Conserta um mês que saiu de sincronia por erro em alguma operação.
   */
  const recalculate = useMutation({
    mutationFn: async () => {
      if (!currentMonth) throw new Error("Mês atual não encontrado.");
      return monthService.recalculate(currentMonth);
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries();
      toast.success(
        `Saldos recalculados. Disponível: ${formatCurrency(Number(updated.available_balance))}`
      );
    },
    onError: (error) => toast.error(error.message),
  });

  const resetMonth = useMutation({
    mutationFn: async () => {
      if (!currentMonth) throw new Error("Mês atual não encontrado.");
      await monthService.resetMonth(currentMonth);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: currentMonth?.id ? queryKeys.transactions(currentMonth.id) : [] });
      queryClient.invalidateQueries({ queryKey: currentMonth?.id ? queryKeys.budgets(currentMonth.id) : [] });
      queryClient.invalidateQueries({ queryKey: currentMonth?.id ? queryKeys.payments(currentMonth.id) : [] });
      queryClient.invalidateQueries({ queryKey: queryKeys.currentMonth });
      toast.success("Todos os dados e transações do mês foram resetados!");
    },
    onError: (error) => toast.error(error.message),
  });

  const closeMonth = useMutation({
    mutationFn: async () => {
      if (!currentMonth) throw new Error("Mês atual não encontrado.");
      await monthRepository.update(currentMonth.id, { closed: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.currentMonth });
      toast.success("Mês fechado com sucesso!");
    },
    onError: (error) => toast.error(error.message),
  });

  if (!vault) return null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Configurações"
        description="Conta, preferências e utilitários de banco."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Card 1: Account Info */}
        <Card className="border-border/40">
          <CardHeader>
            <span className="mb-1 flex size-9 items-center justify-center rounded-lg border bg-card">
              <VaultIcon className="size-4 text-muted-foreground" />
            </span>
            <CardTitle>{vault.name}</CardTitle>
            <CardDescription>
              Cofre criado em {formatDate(vault.created_at)}. Dados em data/budgetos.db nesta máquina.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-xs text-muted-foreground space-y-1.5">
              <p>Versão do BudgetOS: <span className="font-semibold text-foreground">v2.0.0</span></p>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Investment goal */}
        <Card className="border-border/40">
          <CardHeader>
            <span className="mb-1 flex size-9 items-center justify-center rounded-lg border bg-card">
              <PiggyBank className="size-4 text-muted-foreground" />
            </span>
            <CardTitle>Meta de investimento</CardTitle>
            <CardDescription>
              Reservada todo mês antes do cálculo do disponível. Vale também para o mês atual.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                saveGoal.mutate();
              }}
            >
              <div className="flex-1 space-y-2">
                <Label htmlFor="settings-goal">Valor mensal</Label>
                <Input
                  id="settings-goal"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                />
              </div>
              <Button type="submit" size="sm" disabled={saveGoal.isPending}>
                Salvar
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Card 3: Theme */}
        <Card className="border-border/40">
          <CardHeader>
            <span className="mb-1 flex size-9 items-center justify-center rounded-lg border bg-card">
              <Sun className="size-4 text-muted-foreground" />
            </span>
            <CardTitle>Tema visual</CardTitle>
            <CardDescription>Altere a interface de cores do aplicativo.</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button
              variant={mounted && theme === "dark" ? "default" : "outline"}
              size="sm"
              onClick={() => setTheme("dark")}
            >
              <Moon className="size-4 mr-2" /> Escuro
            </Button>
            <Button
              variant={mounted && theme === "light" ? "default" : "outline"}
              size="sm"
              onClick={() => setTheme("light")}
            >
              <Sun className="size-4 mr-2" /> Claro
            </Button>
          </CardContent>
        </Card>

        {/* Card 4: Monthly spreadsheet — the main data entry path */}
        <Card className="border-border/40 lg:col-span-2">
          <CardHeader>
            <span className="mb-1 flex size-9 items-center justify-center rounded-lg border bg-card">
              <Upload className="size-4 text-muted-foreground" />
            </span>
            <CardTitle>Planilha do mês</CardTitle>
            <CardDescription>
              Preencha o mês todo numa planilha e suba de uma vez, em vez de
              lançar um por um aqui dentro.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => downloadTemplate(false)}
                disabled={downloading}
              >
                {downloading ? (
                  <>
                    <RefreshCw className="size-4 mr-2 animate-spin" /> Gerando…
                  </>
                ) : (
                  <>
                    <FileDown className="size-4 mr-2" /> Baixar o modelo
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setImportOpen(true)}
              >
                <Upload className="size-4 mr-2" /> Importar planilha
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => downloadTemplate(true)}
                disabled={downloading}
              >
                Modelo em branco
              </Button>
            </div>

            <p className="text-xs leading-relaxed text-muted-foreground">
              O modelo vem com o seu cadastro atual já preenchido — contas
              fixas, assinaturas, parcelas em andamento, cartões, categorias e
              entradas fixas. A ideia é corrigir valores, lançar os gastos do
              mês na aba <strong className="text-foreground">Lançamentos</strong>{" "}
              e subir. A aba{" "}
              <strong className="text-foreground">Como preencher</strong>{" "}
              explica cada coluna.
            </p>

            <div className="space-y-1.5 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
              <p>
                <strong className="text-foreground">O cadastro</strong> (contas
                fixas, assinaturas, cartões, categorias, entradas fixas,
                compras parceladas) é casado pelo nome: o que está na planilha é
                atualizado, o que não está é criado, e o que existe só no app
                fica como está. Importar nunca apaga cadastro — é assim que um
                gasto fixo que mudou de valor se atualiza sem perder histórico.
              </p>
              <p>
                <strong className="text-foreground">O movimento do mês</strong>{" "}
                (lançamentos, aportes, ajustes, contas pagas) é substituído por
                mês: subir o mesmo mês corrigido troca só as linhas que a
                importação anterior criou, sem duplicar. O que você lançar à mão
                aqui dentro continua intacto.
              </p>
              <p>
                O app confere o arquivo e mostra tudo que vai mudar antes de
                gravar, apontando a aba e a linha de qualquer problema.
              </p>
            </div>

            {sheetImports && sheetImports.length > 0 && (
              <div className="space-y-1 border-t pt-4">
                <p className="text-xs font-semibold text-foreground">
                  Últimas importações
                </p>
                <ul className="space-y-1">
                  {sheetImports.slice(0, 4).map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-muted-foreground"
                    >
                      <span className="font-medium text-foreground tabular-nums">
                        {String(item.month).padStart(2, "0")}/{item.year}
                      </span>
                      <span className="truncate">{item.filename}</span>
                      <span className="ml-auto tabular-nums">
                        {formatDate(item.imported_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 5: Backup and Data import/export */}
        <Card className="border-border/40">
          <CardHeader>
            <span className="mb-1 flex size-9 items-center justify-center rounded-lg border bg-card">
              <Download className="size-4 text-muted-foreground" />
            </span>
            <CardTitle>Exportar e fazer backup</CardTitle>
            <CardDescription>
              Leve tudo para uma planilha, ou guarde uma cópia do banco.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Button size="sm" onClick={exportSpreadsheet} disabled={exporting}>
                {exporting ? (
                  <>
                    <RefreshCw className="size-4 mr-2 animate-spin" /> Gerando…
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="size-4 mr-2" /> Baixar planilha
                    (.xlsx)
                  </>
                )}
              </Button>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Uma aba por assunto: meses, entradas e contas fixas, assinaturas,
                cartões, compras parceladas, parcelas, faturas, lançamentos,
                ajustes, aportes e orçamentos. Abre no Excel, no Google Planilhas
                e no LibreOffice.
              </p>
            </div>

            <div className="space-y-2 border-t pt-4">
              <p className="text-xs font-semibold text-foreground">
                Backup de verdade
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Esta planilha é para ler e conferir — quem volta para dentro do
                app é a planilha do mês, no modelo acima. Para poder restaurar,
                copie o arquivo{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                  data/budgetos.db
                </code>{" "}
                desta pasta para outro lugar com o app fechado. Restaurar é pôr
                o arquivo de volta no mesmo caminho.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Card 6: Operations & Actions */}
        <Card className="border-border/40">
          <CardHeader>
            <span className="mb-1 flex size-9 items-center justify-center rounded-lg border bg-card">
              <RefreshCw className="size-4 text-muted-foreground" />
            </span>
            <CardTitle>Ações Críticas do Mês</CardTitle>
            <CardDescription>Resetar transações do mês ou realizar fechamento contábil.</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => recalculate.mutate()}
              disabled={recalculate.isPending}
            >
              <Calculator className="size-4 mr-2" />
              {recalculate.isPending ? "Recalculando…" : "Recalcular saldos"}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (window.confirm("ATENÇÃO: Deseja realmente resetar este mês? Isso apagará transações, pagamentos e aportes, desmarcará as faturas e zerará os gastos das categorias.")) {
                  resetMonth.mutate();
                }
              }}
              disabled={resetMonth.isPending}
            >
              <RefreshCw className="size-4 mr-2" /> Resetar Mês
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (window.confirm("Deseja fechar o mês financeiro manualmente? Transações e pagamentos não poderão mais ser alterados.")) {
                  closeMonth.mutate();
                }
              }}
              disabled={closeMonth.isPending || currentMonth?.closed}
            >
              <Lock className="size-4 mr-2" /> Fechar Mês
            </Button>
          </CardContent>
        </Card>
      </div>

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
