"use server";

import { all } from "@/lib/db";
import { adjustmentDelta, round2 } from "@/lib/finance";
import type { AdjustmentType } from "@/types/database";
import type {
  AnnualFlow,
  FlowBreakdown,
  FlowKind,
  FlowMonth,
  FlowMovement,
} from "@/types/flow";

const pad = (n: number) => String(n).padStart(2, "0");

function emptyMonth(month: number): FlowMonth {
  return {
    month,
    opened: false,
    closed: false,
    startingBalance: null,
    endingBalance: null,
    inflow: 0,
    outflow: 0,
    invested: 0,
    net: 0,
    breakdown: {
      salary: 0,
      extra: 0,
      income: 0,
      expenses: 0,
      fixed: 0,
      invoices: 0,
      adjustmentsIn: 0,
      adjustmentsOut: 0,
      investments: 0,
    },
    movements: [],
  };
}

const BREAKDOWN_KEY: Record<Exclude<FlowKind, "adjustment">, keyof FlowBreakdown> =
  {
    salary: "salary",
    extra: "extra",
    income: "income",
    expense: "expenses",
    fixed: "fixed",
    invoice: "invoices",
    investment: "investments",
  };

function push(target: FlowMonth, movement: FlowMovement): void {
  if (movement.amount <= 0) return;
  target.movements.push(movement);

  if (movement.direction === "in") target.inflow += movement.amount;
  else if (movement.direction === "out") target.outflow += movement.amount;
  else target.invested += movement.amount;

  const key =
    movement.kind === "adjustment"
      ? movement.direction === "in"
        ? "adjustmentsIn"
        : "adjustmentsOut"
      : BREAKDOWN_KEY[movement.kind];
  target.breakdown[key] += movement.amount;
}

/**
 * Entradas e saídas de cada mês do ano, com a lista de movimentos.
 *
 * Segue a mesma regra de `monthService.recalculate`, para os totais baterem
 * com o saldo do app: entram salário, receitas extras, receitas lançadas e
 * ajustes positivos; saem gastos, contas fixas pagas, faturas pagas e ajustes
 * negativos. Parcelas e assinaturas não aparecem soltas — já estão dentro da
 * fatura paga. Aportes aparecem à parte.
 */
export async function getAnnualFlow(year: number): Promise<AnnualFlow> {
  const months = new Map<number, FlowMonth>();
  for (let m = 1; m <= 12; m++) months.set(m, emptyMonth(m));

  const monthRows = all<{
    id: string;
    month: number;
    closed: number;
    starting_balance: number;
    salary: number;
    extra_income: number;
    bank_balance: number;
  }>(
    `SELECT id, month, closed, starting_balance, salary, extra_income, bank_balance
     FROM months WHERE year = :year`,
    { year }
  );

  for (const row of monthRows) {
    const target = months.get(row.month)!;
    const firstDay = `${year}-${pad(row.month)}-01`;
    target.opened = true;
    target.closed = Boolean(row.closed);
    target.startingBalance = Number(row.starting_balance);
    target.endingBalance = Number(row.bank_balance);

    push(target, {
      id: `salary-${row.id}`,
      kind: "salary",
      direction: "in",
      label: "Salário",
      detail: "Entradas fixas do mês",
      date: firstDay,
      amount: Number(row.salary),
    });
    push(target, {
      id: `extra-${row.id}`,
      kind: "extra",
      direction: "in",
      label: "Receitas extras",
      detail: "Informadas na abertura do mês",
      date: firstDay,
      amount: Number(row.extra_income),
    });
  }

  // Aportes vêm da tabela própria; as transações do tipo `investment`
  // espelham os mesmos aportes e contariam em dobro.
  const transactions = all<{
    id: string;
    month: number;
    type: "expense" | "income";
    amount: number;
    description: string | null;
    date: string;
    category_name: string | null;
  }>(
    `SELECT t.id, m.month, t.type, t.amount, t.description, t.date,
            c.name AS category_name
     FROM transactions t
     JOIN months m ON m.id = t.month_id
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE m.year = :year AND t.type IN ('expense', 'income')`,
    { year }
  );
  for (const tx of transactions) {
    const income = tx.type === "income";
    push(months.get(tx.month)!, {
      id: tx.id,
      kind: income ? "income" : "expense",
      direction: income ? "in" : "out",
      label: tx.description || (income ? "Receita" : "Gasto"),
      detail: tx.category_name,
      date: tx.date,
      amount: Number(tx.amount),
    });
  }

  const adjustments = all<{
    id: string;
    month: number;
    type: AdjustmentType;
    amount: number;
    description: string | null;
    created_at: string;
  }>(
    `SELECT a.id, m.month, a.type, a.amount, a.description, a.created_at
     FROM balance_adjustments a
     JOIN months m ON m.id = a.month_id
     WHERE m.year = :year`,
    { year }
  );
  const ADJUSTMENT_LABEL: Record<AdjustmentType, string> = {
    entry: "Entrada avulsa",
    exit: "Saída avulsa",
    correction: "Correção de saldo",
    transfer: "Transferência",
  };
  for (const adj of adjustments) {
    const delta = adjustmentDelta(adj.type, Number(adj.amount));
    push(months.get(adj.month)!, {
      id: adj.id,
      kind: "adjustment",
      direction: delta >= 0 ? "in" : "out",
      label: adj.description || ADJUSTMENT_LABEL[adj.type],
      detail: ADJUSTMENT_LABEL[adj.type],
      date: adj.created_at.slice(0, 10),
      amount: Math.abs(delta),
    });
  }

  const payments = all<{
    id: string;
    month: number;
    amount: number;
    paid_at: string;
    expense_name: string | null;
  }>(
    `SELECT p.id, m.month, p.amount, p.paid_at, f.name AS expense_name
     FROM fixed_expense_payments p
     JOIN months m ON m.id = p.month_id
     LEFT JOIN fixed_expenses f ON f.id = p.fixed_expense_id
     WHERE m.year = :year`,
    { year }
  );
  for (const pay of payments) {
    push(months.get(pay.month)!, {
      id: pay.id,
      kind: "fixed",
      direction: "out",
      label: pay.expense_name ?? "Conta fixa",
      detail: "Conta fixa paga",
      date: pay.paid_at.slice(0, 10),
      amount: Number(pay.amount),
    });
  }

  const invoices = all<{
    id: string;
    month: number;
    total: number;
    paid_at: string | null;
    due_date: string;
    card_name: string | null;
  }>(
    `SELECT i.id, i.month, i.total, i.paid_at, i.due_date, c.name AS card_name
     FROM card_invoices i
     LEFT JOIN credit_cards c ON c.id = i.card_id
     WHERE i.year = :year AND i.paid = 1`,
    { year }
  );
  for (const inv of invoices) {
    push(months.get(inv.month)!, {
      id: inv.id,
      kind: "invoice",
      direction: "out",
      label: `Fatura ${inv.card_name ?? "do cartão"}`,
      detail: "Fatura paga",
      date: (inv.paid_at ?? inv.due_date).slice(0, 10),
      amount: Number(inv.total),
    });
  }

  const investments = all<{
    id: string;
    month: number;
    amount: number;
    description: string | null;
    created_at: string;
  }>(
    `SELECT i.id, m.month, i.amount, i.description, i.created_at
     FROM investments i
     JOIN months m ON m.id = i.month_id
     WHERE m.year = :year`,
    { year }
  );
  for (const inv of investments) {
    push(months.get(inv.month)!, {
      id: inv.id,
      kind: "investment",
      direction: "aside",
      label: inv.description || "Aporte",
      detail: "Separado para investir",
      date: inv.created_at.slice(0, 10),
      amount: Number(inv.amount),
    });
  }

  const list = [...months.values()].map((m) => {
    const breakdown = Object.fromEntries(
      Object.entries(m.breakdown).map(([k, v]) => [k, round2(v)])
    ) as unknown as FlowBreakdown;
    return {
      ...m,
      inflow: round2(m.inflow),
      outflow: round2(m.outflow),
      invested: round2(m.invested),
      net: round2(m.inflow - m.outflow),
      breakdown,
      movements: m.movements.sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          Number(b.direction === "in") - Number(a.direction === "in")
      ),
    };
  });

  const totals = list.reduce(
    (acc, m) => ({
      inflow: acc.inflow + m.inflow,
      outflow: acc.outflow + m.outflow,
      invested: acc.invested + m.invested,
      net: acc.net + m.net,
    }),
    { inflow: 0, outflow: 0, invested: 0, net: 0 }
  );

  const years = all<{ year: number }>(
    "SELECT DISTINCT year FROM months ORDER BY year"
  ).map((r) => Number(r.year));
  if (!years.includes(year)) years.push(year);

  return {
    year,
    months: list,
    totals: {
      inflow: round2(totals.inflow),
      outflow: round2(totals.outflow),
      invested: round2(totals.invested),
      net: round2(totals.net),
    },
    availableYears: years.sort((a, b) => a - b),
  };
}
