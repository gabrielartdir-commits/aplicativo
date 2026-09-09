"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SplashScreen } from "@/components/shared/splash-screen";
import { useVault } from "@/hooks/use-vault";

/**
 * Garante que existe um cofre antes de o app carregar.
 *
 * Só verifica existência — a chave de acesso saiu com a migração para
 * servidor local. Sem cofre, todo o resto quebraria: a abertura do mês
 * depende dele para ler a meta de investimento.
 */
export function VaultGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: vault, isLoading } = useVault();

  useEffect(() => {
    if (!isLoading && !vault) router.replace("/onboarding");
  }, [isLoading, vault, router]);

  if (isLoading || !vault) return <SplashScreen />;
  return children;
}
