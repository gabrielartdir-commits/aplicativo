"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs } from "@/components/ui/tabs";
import { useCommitments } from "@/hooks/use-commitments";
import { InvoicesPanel } from "@/features/invoices";
import { SubscriptionsPanel } from "@/features/subscriptions";
import { CommitmentsOverview } from "./commitments-overview";
import { FixedExpensesList } from "./fixed-expenses-list";

type Tab = "contas" | "faturas" | "assinaturas";

/**
 * Hub dos compromissos do mês: contas fixas, faturas de cartão e assinaturas
 * numa tela só, com o total consolidado no topo.
 */
export function FixedExpensesView() {
  const [tab, setTab] = useState<Tab>("contas");
  const { data: c } = useCommitments();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gastos Fixos"
        description="Tudo que já tem dono antes de qualquer decisão de gasto."
      />

      <CommitmentsOverview />

      <Tabs<Tab>
        items={[
          { value: "contas", label: "Contas", count: c.fixedCount },
          { value: "faturas", label: "Faturas", count: c.invoicesCount },
          {
            value: "assinaturas",
            label: "Assinaturas",
            count: c.creditSubscriptionsCount + c.debitSubscriptionsCount,
          },
        ]}
        value={tab}
        onValueChange={setTab}
      />

      {tab === "contas" && <FixedExpensesList />}
      {tab === "faturas" && <InvoicesPanel />}
      {tab === "assinaturas" && <SubscriptionsPanel />}
    </div>
  );
}
