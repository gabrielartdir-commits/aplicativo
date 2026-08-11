"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTotalInvested } from "@/hooks/use-total-invested";
import {
  TrendingUp,
  PiggyBank,
  Plus,
  Pencil,
  Trash2,
  Sparkles,
  Flame,
  Award,
  PlusCircle,
  Coins,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { useVault } from "@/hooks/use-vault";
import { useCurrentMonth } from "@/hooks/use-current-month";
import { monthRepository } from "@/services/repositories/month-repository";
import { vaultRepository } from "@/services/repositories/vault-repository";
import { investmentRepository } from "@/services/repositories/investment-repository";
import { monthService } from "@/services/month-service";
import { queryKeys } from "@/lib/query-keys";
import { formatCurrency, parseCurrencyInput } from "@/utils/format";
import { cn } from "@/lib/utils";
import { InvestmentDialog } from "@/components/shared/investment-dialog";

interface RecurringInvestment {
  name: string;
  value: number;
  status: "active" | "paused";
}

const RECURRING_STORAGE_KEY = "budgetos.recurring-investment";

interface Reserve {
  id: string;
  name: string;
  target: number;
  current: number;
}

const RESERVES_STORAGE_KEY = "budgetos.investment-reserves";

const DEFAULT_RESERVES: Reserve[] = [
  { id: "1", name: "Reserva de Emergência", target: 12000, current: 4500 },
  { id: "2", name: "ETF (Investimento Global)", target: 50000, current: 8200 },
  { id: "3", name: "Viagem de Fim de Ano", target: 8000, current: 2400 },
  { id: "4", name: "Entrada Apartamento", target: 100000, current: 15000 },
];

export function InvestmentsView() {
  const queryClient = useQueryClient();
  const { data: vault } = useVault();
  const { data: currentMonth } = useCurrentMonth();

  // Load all months to calculate streak & history
  const { data: allMonths, isLoading: monthsLoading } = useQuery({
    queryKey: queryKeys.months,
    queryFn: () => monthRepository.list(),
  });

  const { data: allInvestments } = useQuery({
    queryKey: ["investments"],
    queryFn: () => investmentRepository.listAll(),
  });

  // Multiple Reserves state stored in localStorage
  const [reserves, setReserves] = useState<Reserve[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [investmentDialogOpen, setInvestmentDialogOpen] = useState(false);
  const [editingReserve, setEditingReserve] = useState<Reserve | null>(null);
  
  // Form fields
  const [reserveName, setReserveName] = useState("");
  const [reserveTarget, setReserveTarget] = useState("");
  const [reserveCurrent, setReserveCurrent] = useState("");

  // Recurring investment state
  const [recurringInvestment, setRecurringInvestment] = useState<RecurringInvestment | null>(null);
  const [recurringDialogOpen, setRecurringDialogOpen] = useState(false);
  const [recurringName, setRecurringName] = useState("");
  const [recurringValue, setRecurringValue] = useState("");

  // Initialize/sync recurring investment from localStorage / vault
  useEffect(() => {
    const raw = window.localStorage.getItem(RECURRING_STORAGE_KEY);
    if (raw) {
      try {
        setRecurringInvestment(JSON.parse(raw));
      } catch {
        // Fallback below
      }
    } else if (vault) {
      const initial: RecurringInvestment = {
        name: "Investimento mensal",
        value: vault.investment_goal,
        status: vault.investment_goal > 0 ? "active" : "paused",
      };
      setRecurringInvestment(initial);
      window.localStorage.setItem(RECURRING_STORAGE_KEY, JSON.stringify(initial));
    }
  }, [vault]);

  // Mutation to update vault and current month goal
  const updateGoalMutation = useMutation({
    mutationFn: async ({ value, status }: { value: number; status: "active" | "paused" }) => {
      if (!vault) throw new Error("Vault não encontrado.");
      const effectiveGoal = status === "active" ? value : 0;
      await Promise.all([
        vaultRepository.updateInvestmentGoal(vault.id, effectiveGoal),
        ...(currentMonth ? [monthService.updateCurrentMonthInvestmentGoal(effectiveGoal)] : []),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vault });
      queryClient.invalidateQueries({ queryKey: queryKeys.currentMonth });
      queryClient.invalidateQueries({ queryKey: queryKeys.months });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleRecurringStatus = () => {
    if (!recurringInvestment) return;
    const newStatus = (recurringInvestment.status === "active" ? "paused" : "active") as "active" | "paused";
    const updated = { ...recurringInvestment, status: newStatus };
    setRecurringInvestment(updated);
    window.localStorage.setItem(RECURRING_STORAGE_KEY, JSON.stringify(updated));
    updateGoalMutation.mutate({ value: recurringInvestment.value, status: newStatus });
    toast.success(newStatus === "active" ? "Investimento recorrente ativado." : "Investimento recorrente pausado.");
  };

  const handleDeleteRecurring = () => {
    if (window.confirm("Deseja realmente excluir o investimento recorrente?")) {
      const updated: RecurringInvestment = { name: "Investimento mensal", value: 0, status: "paused" };
      setRecurringInvestment(updated);
      window.localStorage.setItem(RECURRING_STORAGE_KEY, JSON.stringify(updated));
      updateGoalMutation.mutate({ value: 0, status: "paused" });
      toast.success("Investimento recorrente excluído.");
    }
  };

  const openEditRecurring = () => {
    if (!recurringInvestment) return;
    setRecurringName(recurringInvestment.name);
    setRecurringValue(String(recurringInvestment.value));
    setRecurringDialogOpen(true);
  };

  const openCreateRecurring = () => {
    setRecurringName("Investimento mensal");
    setRecurringValue("");
    setRecurringDialogOpen(true);
  };

  const handleSubmitRecurring = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recurringName.trim() || !recurringValue) {
      toast.error("Preencha todos os campos.");
      return;
    }
    const val = parseCurrencyInput(recurringValue);
    if (Number.isNaN(val) || val < 0) {
      toast.error("Informe um valor válido.");
      return;
    }

    const updated: RecurringInvestment = {
      name: recurringName,
      value: val,
      status: "active",
    };

    setRecurringInvestment(updated);
    window.localStorage.setItem(RECURRING_STORAGE_KEY, JSON.stringify(updated));
    updateGoalMutation.mutate({ value: val, status: "active" });
    setRecurringDialogOpen(false);
    toast.success("Investimento recorrente salvo com sucesso.");
  };

  // Load reserves on mount
  useEffect(() => {
    const raw = window.localStorage.getItem(RESERVES_STORAGE_KEY);
    if (raw) {
      try {
        setReserves(JSON.parse(raw));
      } catch {
        setReserves(DEFAULT_RESERVES);
      }
    } else {
      setReserves(DEFAULT_RESERVES);
      window.localStorage.setItem(RESERVES_STORAGE_KEY, JSON.stringify(DEFAULT_RESERVES));
    }
  }, []);

  const saveReserves = (newReserves: Reserve[]) => {
    setReserves(newReserves);
    window.localStorage.setItem(RESERVES_STORAGE_KEY, JSON.stringify(newReserves));
  };

  // Streak & stats calculation
  const stats = useMemo(() => {
    if (!allMonths || allMonths.length === 0 || !vault) {
      return { streak: 0, accumulated: 0, history: [] };
    }

    // Sort months oldest to newest for accumulated history, but descending for streak calculation
    const chronological = [...allMonths].sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });

    const descending = [...chronological].reverse();

    // Calculate Streak (consecutive months goal met starting from current/latest month)
    let streak = 0;
    const currentGoal = vault.investment_goal;
    for (const m of descending) {
      if (m.reserved_investment >= currentGoal && currentGoal > 0) {
        streak++;
      } else if (currentGoal > 0) {
        break;
      }
    }

    const accumulated = chronological.reduce((sum, m) => sum + m.reserved_investment, 0);

    return { streak, accumulated, history: chronological };
  }, [allMonths, vault]);

  const currentMonthInvested = useMemo(() => {
    if (!currentMonth || !allInvestments) return 0;
    return allInvestments
      .filter((inv) => inv.month_id === currentMonth.id)
      .reduce((sum, inv) => sum + inv.amount, 0);
  }, [currentMonth, allInvestments]);

  /** Mesma conta usada na Home, para os dois números nunca divergirem. */
  const { total: totalAccumulated } = useTotalInvested();

  // Create or edit reserve
  const handleSubmitReserve = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reserveName.trim() || !reserveTarget || !reserveCurrent) {
      toast.error("Preencha todos os campos.");
      return;
    }

    const targetVal = parseCurrencyInput(reserveTarget);
    const currentVal = parseCurrencyInput(reserveCurrent);

    if (Number.isNaN(targetVal) || targetVal <= 0 || Number.isNaN(currentVal) || currentVal < 0) {
      toast.error("Informe valores numéricos válidos.");
      return;
    }

    if (editingReserve) {
      // Edit
      const updated = reserves.map((r) =>
        r.id === editingReserve.id
          ? { ...r, name: reserveName, target: targetVal, current: currentVal }
          : r
      );
      saveReserves(updated);
      toast.success("Reserva atualizada com sucesso.");
    } else {
      // Create
      const newReserve: Reserve = {
        id: crypto.randomUUID(),
        name: reserveName,
        target: targetVal,
        current: currentVal,
      };
      saveReserves([...reserves, newReserve]);
      toast.success("Nova reserva criada com sucesso.");
    }

    setDialogOpen(false);
  };

  // Delete reserve
  const handleDeleteReserve = (id: string, name: string) => {
    if (window.confirm(`Deseja excluir a reserva "${name}"?`)) {
      const updated = reserves.filter((r) => r.id !== id);
      saveReserves(updated);
      toast.success("Reserva excluída.");
    }
  };

  const openEdit = (reserve: Reserve) => {
    setEditingReserve(reserve);
    setReserveName(reserve.name);
    setReserveTarget(String(reserve.target));
    setReserveCurrent(String(reserve.current));
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditingReserve(null);
    setReserveName("");
    setReserveTarget("");
    setReserveCurrent("");
    setDialogOpen(true);
  };

  // AI Insights
  const aiInsight = useMemo(() => {
    if (stats.streak >= 3) {
      return `Dica IA: Incrível! Você está em uma sequência de ${stats.streak} meses batendo sua meta de aportes. Isso acelera seus planos de longo prazo em até 22%.`;
    }
    if (totalAccumulated > 10000) {
      return "Dica IA: Seu patrimônio acumulado está crescendo. Que tal simular na aba 'Simulações' o impacto de manter este ritmo por mais 12 meses?";
    }
    return "Dica IA: Separar o investimento logo na abertura do mês é o hábito das pessoas mais bem-sucedidas financeiramente. Continue assim!";
  }, [stats.streak, totalAccumulated]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Investimentos"
        description="O centro de acumulação do seu patrimônio e conquistas de metas."
      >
        <div className="flex gap-2">
          {currentMonth && (
            <Button size="sm" variant="outline" onClick={() => setInvestmentDialogOpen(true)}>
              <PiggyBank className="size-4 mr-1.5" />
              Registrar aporte
            </Button>
          )}
          <Button size="sm" onClick={openCreate}>
            <Plus />
            Nova reserva
          </Button>
        </div>
      </PageHeader>

      {/* Main Stats Cards Grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/40 bg-accent/5">
          <CardContent className="p-5 flex flex-col justify-between h-full">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Meta Mensal</p>
            <span className="text-2xl font-bold tracking-tight mt-3 tabular-nums">
              {formatCurrency(vault?.investment_goal ?? 0)}
            </span>
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-emerald-500/5">
          <CardContent className="p-5 flex flex-col justify-between h-full">
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Aporte Deste Mês</p>
            <span className="text-2xl font-bold tracking-tight text-emerald-400 mt-3 tabular-nums">
              {formatCurrency(currentMonthInvested)}
            </span>
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-primary/5">
          <CardContent className="p-5 flex flex-col justify-between h-full">
            <p className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
              <Coins className="size-3.5" /> Total Acumulado
            </p>
            <span className="text-2xl font-bold tracking-tight text-primary mt-3 tabular-nums">
              {formatCurrency(totalAccumulated)}
            </span>
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-orange-500/5">
          <CardContent className="p-5 flex flex-col justify-between h-full">
            <p className="text-xs font-semibold text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
              <Flame className="size-3.5" /> Sequência Ativa
            </p>
            <span className="text-2xl font-bold tracking-tight text-orange-400 mt-3 tabular-nums">
              {stats.streak} {stats.streak === 1 ? "mês" : "meses"}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* AI Insight Card */}
      <div className="flex gap-2.5 items-start rounded-xl border border-primary/15 bg-primary/5 p-4 text-xs text-muted-foreground leading-relaxed">
        <Sparkles className="size-4.5 text-primary shrink-0 mt-0.5" />
        <span className="font-medium">{aiInsight}</span>
      </div>

      {/* Investimento Recorrente */}
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Investimento Recorrente</h2>
          <p className="text-xs text-muted-foreground">
            O investimento configurado como padrão para ser separado no início de cada mês.
          </p>
        </div>

        {!recurringInvestment || recurringInvestment.value === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">Nenhum investimento recorrente cadastrado.</p>
            <Button size="sm" variant="outline" onClick={openCreateRecurring}>
              <PlusCircle className="size-4 mr-1.5" />
              Cadastrar investimento recorrente
            </Button>
          </div>
        ) : (
          <Card className="border-border/40 hover:border-border/80 transition-colors shadow-sm duration-300">
            <CardContent className="p-5 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-card text-xl">
                  💰
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground/90">{recurringInvestment.name}</h3>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border",
                        recurringInvestment.status === "active"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      )}
                    >
                      {recurringInvestment.status === "active" ? "Ativo" : "Pausado"}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-primary mt-1 tabular-nums">
                    {formatCurrency(recurringInvestment.value)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {recurringInvestment.status === "active"
                      ? "Todo mês esse valor é separado automaticamente."
                      : "Esse valor está pausado e não será separado."}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" onClick={openEditRecurring}>
                  Editar
                </Button>
                <Button size="sm" variant="outline" onClick={toggleRecurringStatus}>
                  {recurringInvestment.status === "active" ? "Pausar" : "Ativar"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={handleDeleteRecurring}
                >
                  Excluir
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Multiple Reserves Workspace */}
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Minhas Reservas</h2>
          <p className="text-xs text-muted-foreground">Fundos de objetivos específicos baseados em seus investimentos acumulados.</p>
        </div>

        {reserves.length === 0 ? (
          <EmptyState
            icon={PiggyBank}
            title="Nenhuma reserva criada"
            description="Crie reservas como Entrada do Carro, Reserva de Emergência ou Viagem para categorizar o seu dinheiro acumulado."
          />
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {reserves.map((reserve) => {
              const ratio = reserve.target > 0 ? reserve.current / reserve.target : 0;
              const progress = Math.min(ratio * 100, 100);

              return (
                <Card key={reserve.id} className="border-border/40 hover:border-border/80 transition-colors shadow-sm duration-300">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold text-foreground/90">{reserve.name}</h3>
                        <p className="text-xs text-muted-foreground">Meta: {formatCurrency(reserve.target)}</p>
                      </div>
                      <div className="flex gap-0.5">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(reserve)}>
                          <Pencil className="size-3.5 text-muted-foreground hover:text-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => handleDeleteReserve(reserve.id, reserve.name)}>
                          <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-semibold tabular-nums">
                        <span>{formatCurrency(reserve.current)}</span>
                        <span className="text-primary">{Math.round(ratio * 100)}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* History timeline list */}
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Histórico de Aportes</h2>
          <p className="text-xs text-muted-foreground">Sua jornada de investimentos mês a mês.</p>
        </div>
        {monthsLoading ? (
          <p className="text-sm text-muted-foreground">Carregando histórico...</p>
        ) : (
          <div className="rounded-xl border bg-card divide-y">
            {stats.history.slice().reverse().map((m) => {
              const targetGoal = vault?.investment_goal ?? 0;
              const met = m.reserved_investment >= targetGoal && targetGoal > 0;
              return (
                <div key={m.id} className="flex items-center justify-between px-5 py-3.5 text-sm">
                  <span className="font-semibold text-foreground/80">
                    {m.month}/{m.year}
                  </span>
                  <div className="flex items-center gap-3 sm:gap-6">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Meta</p>
                      <p className="font-medium tabular-nums">{formatCurrency(targetGoal)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Aportado</p>
                      <p className={cn("font-medium tabular-nums", met ? "text-emerald-400" : "text-foreground")}>
                        {formatCurrency(m.reserved_investment)}
                      </p>
                    </div>
                    {targetGoal > 0 && (
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border",
                        met ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-accent text-muted-foreground border-border/40"
                      )}>
                        {met ? "Batida" : "Pendente"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingReserve ? "Editar Reserva" : "Nova Reserva"}</DialogTitle>
            <DialogDescription>
              Defina um objetivo financeiro para seus recursos guardados.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitReserve} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reserve-name">Nome da Reserva</Label>
              <Input
                id="reserve-name"
                placeholder="Ex.: Viagem para a Itália"
                value={reserveName}
                onChange={(e) => setReserveName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="reserve-target">Meta (R$)</Label>
                <Input
                  id="reserve-target"
                  placeholder="10.000,00"
                  value={reserveTarget}
                  onChange={(e) => setReserveTarget(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reserve-current">Valor Atual (R$)</Label>
                <Input
                  id="reserve-current"
                  placeholder="1.500,00"
                  value={reserveCurrent}
                  onChange={(e) => setReserveCurrent(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">
                {editingReserve ? "Salvar" : "Criar Reserva"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={recurringDialogOpen} onOpenChange={setRecurringDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Investimento Recorrente</DialogTitle>
            <DialogDescription>
              Configure o investimento recorrente mensal padrão.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitRecurring} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recurring-name">Nome do Investimento</Label>
              <Input
                id="recurring-name"
                placeholder="Ex.: Investimento mensal"
                value={recurringName}
                onChange={(e) => setRecurringName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recurring-value">Valor Mensal (R$)</Label>
              <Input
                id="recurring-value"
                placeholder="1.500,00"
                value={recurringValue}
                onChange={(e) => setRecurringValue(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setRecurringDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={updateGoalMutation.isPending}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {currentMonth && (
        <InvestmentDialog
          open={investmentDialogOpen}
          onOpenChange={setInvestmentDialogOpen}
          month={currentMonth}
        />
      )}
    </div>
  );
}
