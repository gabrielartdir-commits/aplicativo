/**
 * Projeção dos próximos meses.
 *
 * Nada aqui vem de planilha: a tela "Próximos meses" é calculada a partir do
 * cadastro que o app já tem — contas fixas, assinaturas, parcelas em aberto e
 * a média dos gastos variáveis dos meses já vividos.
 */

/** As quatro partes que compõem a saída projetada de um mês. */
export type ForecastPart = "fixos" | "assinaturas" | "parcelas" | "variaveis";

export interface ForecastItem {
  part: ForecastPart;
  label: string;
  /** Complemento curto: "vence dia 10", "Nubank", "parcela 4 de 10". */
  detail: string;
  amount: number;
}

export interface ForecastMonth {
  year: number;
  month: number;
  /** "nov/26" */
  competence: string;
  fixos: number;
  assinaturas: number;
  parcelas: number;
  variaveis: number;
  /** Soma das quatro partes. */
  saidas: number;
  entradas: number;
  /** entradas - saidas */
  saldo: number;
  /** Saldo somado desde o primeiro mês projetado. */
  acumulado: number;
  items: ForecastItem[];
}

/**
 * A média de gastos variáveis e de onde ela saiu.
 *
 * A tela mostra os meses que entraram na conta: uma média é um palpite, e o
 * palpite tem de ser auditável.
 */
export interface ForecastAverage {
  value: number;
  monthsUsed: number;
  perMonth: { competence: string; total: number }[];
  /**
   * `true` quando só havia o mês em andamento para calcular — a média sai
   * baixa porque o mês ainda não acabou, e a tela precisa avisar.
   */
  partial: boolean;
}

export interface ForecastProjection {
  /** Primeiro mês projetado; `null` quando não há mês aberto no app. */
  start: { year: number; month: number } | null;
  months: ForecastMonth[];
  average: ForecastAverage;
  /** Totais do horizonte inteiro. */
  totals: { saidas: number; entradas: number; saldo: number };
  /** Valores do mês típico, para os cartões do topo. */
  monthly: {
    fixos: number;
    assinaturas: number;
    variaveis: number;
    entradas: number;
  };
  /** Competência da última parcela conhecida — quando o cartão alivia. */
  lastInstallment: string | null;
}
