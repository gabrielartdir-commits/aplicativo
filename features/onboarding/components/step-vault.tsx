"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Vault } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { queryKeys } from "@/lib/query-keys";
import { vaultRepository } from "@/services/repositories/vault-repository";

/**
 * Primeiro passo do onboarding: só o nome do cofre.
 *
 * A chave de acesso saiu junto com a migração para servidor local — os dados
 * ficam num arquivo na sua máquina, e quem protege esse arquivo é a conta do
 * Windows. Uma segunda senha só adicionaria fricção.
 */
export function StepVault({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  async function createVault() {
    const trimmed = name.trim();
    if (!trimmed) return;

    setCreating(true);
    try {
      await vaultRepository.create({ name: trimmed });
      queryClient.invalidateQueries({ queryKey: queryKeys.vault });
      onDone();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao criar o cofre"
      );
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="vault-name">Nome do cofre</Label>
        <Input
          id="vault-name"
          placeholder="Finanças da casa"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) {
              e.preventDefault();
              createVault();
            }
          }}
          autoFocus
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Seus dados ficam num arquivo nesta máquina, em{" "}
          <code className="rounded bg-accent/30 px-1 py-0.5">data/budgetos.db</code>.
          Para fazer backup, copie esse arquivo.
        </p>
      </div>

      <Button onClick={createVault} disabled={!name.trim() || creating}>
        <Vault />
        {creating ? "Criando…" : "Criar cofre"}
      </Button>
    </div>
  );
}
