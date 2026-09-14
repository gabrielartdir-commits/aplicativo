/** Tipos do fluxo anual — compartilhados entre a consulta no servidor e a tela. */

export type FlowKind =
  | "salary"
  | "extra"
  | "income"
  | "expense"
  | "fixed"
  | "invoice"
  | "adjustment"
  | "investment";

/**
 * `in` entra no saldo, `out` sai. `aside` é dinheiro separado para investir:
 * no modelo do app o aporte consome a reserva, não o saldo bancário, então
 * ele é mostrado mas fica fora de entradas e saídas.
 */
export type FlowDirection = "in" | "out" | "aside";

export interface FlowMovement {
  id: string;
  kind: FlowKind;
  direction: FlowDirection;
  label: string;
  detail: string | null;
  /** AAAA-MM-DD */
  date: string;
  /** Sempre positivo; o sentido vem de `direction`. */
  amount: number;
}

export interface FlowBreakdown {
  salary: number;
  extra: number;
  income: number;
  expenses: number;
  fixed: number;
  invoices: number;
  adjustmentsIn: number;
  adjustmentsOut: number;
  investments: number;
}

export interface FlowMonth {
  /** 1 a 12 */
  month: number;
  /** Se o mês financeiro chegou a ser aberto no app. */
  opened: boolean;
  closed: boolean;
  startingBalance: number | null;
  endingBalance: number | null;
  inflow: number;
  outflow: number;
  invested: number;
  net: number;
  breakdown: FlowBreakdown;
  movements: FlowMovement[];
}

export interface AnnualFlow {
  year: number;
  months: FlowMonth[];
  totals: { inflow: number; outflow: number; invested: number; net: number };
  availableYears: number[];
}
