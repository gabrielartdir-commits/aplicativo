"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVault } from "@/hooks/use-vault";
import { StepCategories } from "./step-categories";
import { StepFixedExpenses } from "./step-fixed-expenses";
import { StepInvestment } from "./step-investment";
import { StepVault } from "./step-vault";

const steps = [
  {
    title: "Crie seu cofre",
    description: "Seu espaço financeiro pessoal, guardado nesta máquina.",
  },
  {
    title: "Meta de investimento",
    description: "Quanto você quer guardar todo mês, antes de qualquer gasto?",
  },
  {
    title: "Gastos fixos",
    description: "O que sai da sua conta todo mês, sem decisão envolvida.",
  },
  {
    title: "Categorias",
    description: "Seus limites de planejamento para os gastos do dia a dia.",
  },
];

export function OnboardingView() {
  const router = useRouter();
  const { data: vault, isLoading } = useVault();
  const [step, setStep] = useState(0);

  // Se já existe um Vault e o onboarding nem começou, este acesso é indevido.
  useEffect(() => {
    if (!isLoading && vault && step === 0) router.replace("/");
  }, [isLoading, vault, step, router]);


  const current = steps[step];

  return (
    <div className="flex min-h-svh flex-col items-center bg-background px-6 py-16">
      <div className="flex items-center gap-2.5">
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary">
          <Sparkles className="size-4 text-primary-foreground" />
        </span>
        <span className="text-sm font-semibold tracking-tight">BudgetOS</span>
      </div>

      <div className="mt-12 w-full max-w-md">
        <div className="mb-8 flex gap-1.5">
          {steps.map((_, index) => (
            <span
              key={index}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                index <= step ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <h1 className="text-xl font-semibold tracking-tight">
              {current.title}
            </h1>
            <p className="mt-1 mb-8 text-sm text-muted-foreground">
              {current.description}
            </p>

            {step === 0 && <StepVault onDone={() => setStep(1)} />}
            {step === 1 && <StepInvestment onDone={() => setStep(2)} />}
            {step === 2 && <StepFixedExpenses onDone={() => setStep(3)} />}
            {step === 3 && (
              <StepCategories onDone={() => router.replace("/")} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
