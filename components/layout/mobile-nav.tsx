"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet,
  Tags,
  Plus,
  Sparkles,
  Menu,
  History,
  Repeat,
  TrendingUp,
  Lightbulb,
  Settings,
  X,
  PlusCircle,
  PiggyBank,
  CalendarRange,
  RefreshCw,
  CreditCard as CreditCardIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentMonth } from "@/hooks/use-current-month";
import { useBudgets } from "@/hooks/use-budgets";
import { ExpenseDialog } from "@/features/home/components/expense-dialog";
import { InvestmentDialog } from "@/components/shared/investment-dialog";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();

  const [plusOpen, setPlusOpen] = useState(false);
  const [maisOpen, setMaisOpen] = useState(false);

  // Modal dialog states
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [investmentOpen, setInvestmentOpen] = useState(false);

  const { data: month } = useCurrentMonth();
  const { data: budgets } = useBudgets(month?.id);

  // Main tabs: Hoje, Categorias, (+), Histórico, Mais
  const activeTabs = [
    { label: "Hoje", href: "/", icon: Wallet },
    { label: "Categorias", href: "/categorias", icon: Tags },
  ];

  const extraItems = [
    { label: "Gastos Fixos", href: "/gastos-fixos", icon: Repeat },
    { label: "Parcelas", href: "/parcelas", icon: CalendarRange },
    { label: "Assinaturas", href: "/assinaturas", icon: RefreshCw },
    { label: "Faturas", href: "/faturas", icon: CreditCardIcon },
    { label: "Investimentos", href: "/investimentos", icon: TrendingUp },
    { label: "Insights", href: "/insights", icon: Lightbulb },
    { label: "Configurações", href: "/configuracoes", icon: Settings },
  ];

  return (
    <>
      {/* Fixed Bottom Navigation (Mobile Only) */}
      <nav
        className="fixed bottom-0 inset-x-0 z-40 border-t border-border/20 bg-background/80 backdrop-blur-xl md:hidden flex items-start justify-around px-2 pt-2 pb-[calc(4px+env(safe-area-inset-bottom,0px))] select-none"
        style={{ height: "calc(64px + env(safe-area-inset-bottom, 0px))" }}
      >
        {/* Hoje & Categorias */}
        {activeTabs.map((tab) => {
          const active = isActive(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 w-12 h-11 transition-all active:scale-95",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon className="size-[21px]" />
              <span className="text-[8px] font-bold tracking-wide uppercase leading-none">{tab.label}</span>
            </Link>
          );
        })}

        {/* Central Plus button */}
        <button
          onClick={() => setPlusOpen(true)}
          aria-label="Ações rápidas"
          className="flex items-center justify-center size-12 rounded-full bg-emerald-500 text-background font-bold shadow-lg hover:bg-emerald-400 active:scale-90 transition-all -translate-y-3.5 border-4 border-background shrink-0"
        >
          <Plus className="size-6" />
        </button>

        {/* Histórico */}
        {(() => {
          const active = isActive(pathname, "/historico");
          return (
            <Link
              href="/historico"
              className={cn(
                "flex flex-col items-center justify-center gap-1 w-12 h-11 transition-all active:scale-95",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <History className="size-[21px]" />
              <span className="text-[8px] font-bold tracking-wide uppercase leading-none">Histórico</span>
            </Link>
          );
        })()}

        {/* Mais Button */}
        <button
          onClick={() => setMaisOpen(true)}
          className={cn(
            "flex flex-col items-center justify-center gap-1 w-12 h-11 transition-all active:scale-95",
            maisOpen ? "text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Menu className="size-[21px]" />
          <span className="text-[8px] font-bold tracking-wide uppercase leading-none">Mais</span>
        </button>
      </nav>

      {/* Slide-up sheet overlays & menus */}
      <AnimatePresence>
        {/* Plus Button Menu Sheet */}
        {plusOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPlusOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="fixed inset-x-0 bottom-0 z-50 rounded-t-[24px] bg-background border-t border-border/20 p-6 shadow-xl pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] md:hidden flex flex-col space-y-4"
            >
              <div className="mx-auto w-12 h-1.5 rounded-full bg-muted/40 shrink-0" />
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-base text-foreground">Novo Lançamento</h3>
                <button onClick={() => setPlusOpen(false)} className="text-muted-foreground p-1 hover:text-foreground">
                  <X className="size-5" />
                </button>
              </div>

              <div className="space-y-2 pt-2">
                {/* Novo gasto */}
                <button
                  onClick={() => {
                    setPlusOpen(false);
                    setExpenseOpen(true);
                  }}
                  className="flex w-full items-center gap-3 rounded-[16px] border border-border/40 bg-card p-4 font-semibold text-sm hover:bg-accent/40 active:scale-98 transition-all"
                >
                  <span className="flex size-9 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500">
                    <PlusCircle className="size-4" />
                  </span>
                  Novo gasto
                </button>

                {/* Registrar aporte */}
                <button
                  onClick={() => {
                    setPlusOpen(false);
                    setInvestmentOpen(true);
                  }}
                  className="flex w-full items-center gap-3 rounded-[16px] border border-border/40 bg-card p-4 font-semibold text-sm hover:bg-accent/40 active:scale-98 transition-all"
                >
                  <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <PiggyBank className="size-4" />
                  </span>
                  Registrar aporte
                </button>

                {/* Simular compra */}
                <button
                  onClick={() => {
                    setPlusOpen(false);
                    router.push("/simulacoes");
                  }}
                  className="flex w-full items-center gap-3 rounded-[16px] border border-border/40 bg-card p-4 font-semibold text-sm hover:bg-accent/40 active:scale-98 transition-all"
                >
                  <span className="flex size-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                    <Sparkles className="size-4" />
                  </span>
                  Simular compra
                </button>
              </div>
            </motion.div>
          </>
        )}

        {/* Mais Menu Sheet */}
        {maisOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMaisOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="fixed inset-x-0 bottom-0 z-50 rounded-t-[24px] bg-background border-t border-border/20 p-6 shadow-xl pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] md:hidden flex flex-col space-y-4"
            >
              <div className="mx-auto w-12 h-1.5 rounded-full bg-muted/40 shrink-0" />
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-base text-foreground">Mais Opções</h3>
                <button onClick={() => setMaisOpen(false)} className="text-muted-foreground p-1 hover:text-foreground">
                  <X className="size-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                {extraItems.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMaisOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-[16px] border p-4 font-medium text-xs transition-all active:scale-98",
                        active
                          ? "border-primary/20 bg-primary/8 text-primary font-semibold"
                          : "border-border/40 bg-card hover:bg-accent/40 text-foreground/80"
                      )}
                    >
                      <item.icon className="size-4 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Global Action Modals */}
      {month && (
        <>
          <ExpenseDialog
            open={expenseOpen}
            onOpenChange={setExpenseOpen}
            month={month}
            categories={(budgets ?? []).map((b) => b.category)}
          />
          <InvestmentDialog
            open={investmentOpen}
            onOpenChange={setInvestmentOpen}
            month={month}
          />
        </>
      )}
    </>
  );
}
