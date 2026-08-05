"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import {
  LockKeyhole,
  PiggyBank,
  Vault as VaultIcon,
  RefreshCw,
  Lock,
  Download,
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
import { queryKeys } from "@/lib/query-keys";
import { clearVaultSession } from "@/lib/vault-session";
import { vaultRepository } from "@/services/repositories/vault-repository";
import { monthService } from "@/services/month-service";
import { formatDate, parseCurrencyInput } from "@/utils/format";
import { createClient } from "@/lib/supabase/client";
import { round2, computeAvailable } from "@/lib/finance";

export function SettingsView() {
  const queryClient = useQueryClient();
  const { data: vault } = useVault();
  const { data: currentMonth } = useCurrentMonth();
  const { theme, setTheme } = useTheme();

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

  const handleExportData = () => {
    const data = {
      vault,
      currentMonth,
      exportedAt: new Date().toISOString(),
    };
    const fileData = JSON.stringify(data, null, 2);
    const blob = new Blob([fileData], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `backup_budgetos_${currentMonth?.year || ""}_${currentMonth?.month || ""}.json`;
    link.href = url;
    link.click();
    toast.success("Backup exportado com sucesso!");
  };

  const handleImportData = () => {
    toast.success("Importação concluída com sucesso (simulada).");
  };

  const resetMonth = useMutation({
    mutationFn: async () => {
      if (!currentMonth) throw new Error("Mês atual não encontrado.");
      const supabase = createClient();
      
      const { error: txError } = await supabase
        .from("transactions")
        .delete()
        .eq("month_id", currentMonth.id);
      if (txError) throw new Error(txError.message);

      const { error: payError } = await supabase
        .from("fixed_expense_payments")
        .delete()
        .eq("month_id", currentMonth.id);
      if (payError) throw new Error(payError.message);

      const { error: budgetError } = await supabase
        .from("monthly_category_budgets")
        .update({ spent: 0 })
        .eq("month_id", currentMonth.id);
      if (budgetError) throw new Error(budgetError.message);

      const bank_balance = round2(
        currentMonth.starting_balance + currentMonth.salary + currentMonth.extra_income
      );
      const available_balance = computeAvailable(
        bank_balance,
        currentMonth.reserved_fixed_expenses,
        currentMonth.reserved_investment,
        currentMonth.reserved_invoices
      );

      const { error: monthError } = await supabase
        .from("months")
        .update({
          bank_balance,
          available_balance,
        })
        .eq("id", currentMonth.id);
      if (monthError) throw new Error(monthError.message);
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
      const supabase = createClient();
      const { error } = await supabase
        .from("months")
        .update({ closed: true })
        .eq("id", currentMonth.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.currentMonth });
      toast.success("Mês fechado com sucesso!");
    },
    onError: (error) => toast.error(error.message),
  });

  function lockVault() {
    clearVaultSession();
    window.location.reload();
  }

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
              Cofre criado em {formatDate(vault.created_at)}. Protegido localmente por chave criptográfica.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-xs text-muted-foreground space-y-1.5">
              <p>Email: <span className="font-semibold text-foreground">depaulaaqui@gmail.com</span></p>
              <p>Versão do BudgetOS: <span className="font-semibold text-foreground">v2.0.0</span></p>
            </div>
            <Button variant="outline" size="sm" onClick={lockVault}>
              <LockKeyhole className="size-4 mr-2" />
              Bloquear cofre
            </Button>
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

        {/* Card 4: Backup and Data import/export */}
        <Card className="border-border/40">
          <CardHeader>
            <span className="mb-1 flex size-9 items-center justify-center rounded-lg border bg-card">
              <Download className="size-4 text-muted-foreground" />
            </span>
            <CardTitle>Backup e Portabilidade</CardTitle>
            <CardDescription>Exporte seus dados financeiros ou restaure um backup existente.</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportData}>
              <Download className="size-4 mr-2" /> Exportar JSON
            </Button>
            <Button variant="outline" size="sm" onClick={handleImportData}>
              <Upload className="size-4 mr-2" /> Importar Backup
            </Button>
          </CardContent>
        </Card>

        {/* Card 5: Operations & Actions */}
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
              variant="destructive"
              size="sm"
              onClick={() => {
                if (window.confirm("ATENÇÃO: Deseja realmente resetar este mês? Isso apagará todas as transações, pagamentos e redefinirá os gastos de categorias para zero.")) {
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
    </div>
  );
}
