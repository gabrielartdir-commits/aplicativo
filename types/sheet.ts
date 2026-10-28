/**
 * Planilha mensal — tipos compartilhados entre leitor, importador e tela.
 *
 * A planilha é o caminho principal de entrada de dados: uma vez por mês o
 * arquivo preenchido sobe e o app distribui cada aba para a sua tabela.
 */

export interface SheetIssue {
  /** Nome da aba onde está o problema. */
  sheet: string;
  /** Linha do Excel, para a mensagem ser localizável. */
  row: number;
  message: string;
}

/** Linha da aba "Mês" — define a competência de toda a planilha. */
export interface SheetMonthRow {
  year: number;
  month: number;
  startingBalance: number | null;
  salary: number | null;
  extraIncome: number | null;
}

export interface SheetCategoryRow {
  name: string;
  emoji: string;
  limit: number | null;
}

export interface SheetCardRow {
  name: string;
  closingDay: number;
  dueDay: number;
  creditLimit: number | null;
}

export interface SheetIncomeRow {
  name: string;
  amount: number;
  active: boolean;
}

export interface SheetFixedRow {
  name: string;
  amount: number;
  dueDay: number;
  active: boolean;
  /** Coluna "Pago": marca o gasto como pago na competência da planilha. */
  paid: boolean;
}

export interface SheetSubscriptionRow {
  name: string;
  amount: number;
  billingDay: number;
  method: "credit" | "debit";
  cardName: string;
  categoryName: string;
  active: boolean;
}

export interface SheetPurchaseRow {
  description: string;
  cardName: string;
  categoryName: string;
  totalAmount: number;
  installmentsCount: number;
  /** Parcela em que a compra está na competência da planilha. */
  currentInstallment: number;
  purchaseDate: string;
}

export interface SheetTransactionRow {
  date: string;
  description: string;
  categoryName: string;
  kind: "expense" | "income";
  amount: number;
}

export interface SheetInvestmentRow {
  amount: number;
  description: string;
}

export interface SheetAdjustmentRow {
  type: "entry" | "exit" | "correction" | "transfer";
  amount: number;
  description: string;
}

/** O conteúdo da planilha, já entendido e sem nada gravado ainda. */
export interface SheetPayload {
  monthRow: SheetMonthRow | null;
  categories: SheetCategoryRow[];
  cards: SheetCardRow[];
  incomes: SheetIncomeRow[];
  fixed: SheetFixedRow[];
  subscriptions: SheetSubscriptionRow[];
  purchases: SheetPurchaseRow[];
  transactions: SheetTransactionRow[];
  investments: SheetInvestmentRow[];
  adjustments: SheetAdjustmentRow[];
  issues: SheetIssue[];
  /** Abas que o arquivo não tinha — informativo, não é erro. */
  missingSheets: string[];
}

/** O que a importação fez (ou faria, na conferência). */
export interface SheetImportReport {
  filename: string;
  /** "11/2026" */
  competence: string;
  monthLabel: string;
  /** `false` na conferência e quando algo bloqueou a gravação. */
  applied: boolean;
  /** `true` quando a competência ainda não existia no app. */
  monthCreated: boolean;
  issues: SheetIssue[];
  warnings: string[];
  counts: {
    categoriasCriadas: number;
    categoriasAtualizadas: number;
    cartoesCriados: number;
    cartoesAtualizados: number;
    entradasCriadas: number;
    entradasAtualizadas: number;
    fixosCriados: number;
    fixosAtualizados: number;
    fixosPagos: number;
    assinaturasCriadas: number;
    assinaturasAtualizadas: number;
    comprasCriadas: number;
    comprasAtualizadas: number;
    lancamentos: number;
    aportes: number;
    ajustes: number;
  };
  /** Linhas de importações anteriores da mesma competência que saem. */
  replaced: {
    lancamentos: number;
    aportes: number;
    ajustes: number;
    pagamentos: number;
  };
  totals: { saidas: number; entradas: number };
  /** Saldo e disponível depois do recálculo. `null` na conferência. */
  balances: { bank: number; available: number } | null;
}

export interface SheetImportLog {
  id: string;
  filename: string;
  year: number;
  month: number;
  summary: string;
  imported_at: string;
}
