/**
 * Tipos do espaço "Próximos meses".
 *
 * Previsão de gastos vinda de planilha. Não se cruza com nenhum tipo do
 * domínio do app — é um retrato do que a planilha diz, só para visualizar.
 */

export type ForecastKind = "entrada" | "saida";
export type ForecastStatus = "previsto" | "confirmado" | "pago";

/** Uma linha da planilha, já validada e gravada. */
export interface ForecastEntry {
  id: string;
  year: number;
  month: number;
  kind: ForecastKind;
  /** Grupo/categoria livre da planilha. Vazio vira "Sem grupo" na tela. */
  group_name: string;
  name: string;
  amount: number;
  status: ForecastStatus;
  /** Forma de pagamento ou origem, texto livre. */
  method: string;
  notes: string;
  import_id: string | null;
  source_row: number | null;
  created_at: string;
}

/** Totais de uma competência, montados no servidor. */
export interface ForecastMonth {
  year: number;
  month: number;
  /** Rótulo curto, como "nov/26". */
  competence: string;
  entradas: number;
  saidas: number;
  /** entradas − saídas. */
  saldo: number;
  /** Saídas por grupo, para as barras empilhadas. */
  groups: Record<string, number>;
  count: number;
}

export interface ForecastSummary {
  months: ForecastMonth[];
  /** Grupos presentes nas saídas, do maior total para o menor. */
  groups: { name: string; total: number }[];
  last: ForecastImportLog | null;
}

export interface ForecastImportLog {
  id: string;
  filename: string;
  entries_count: number;
  replaced_count: number;
  competences: string;
  imported_at: string;
}

/** Problema encontrado numa linha da planilha. */
export interface ForecastIssue {
  /** Linha do Excel (a primeira linha de dados é a 2). */
  row: number;
  message: string;
}

/** O que a importação vai fazer — devolvido antes e depois de aplicar. */
export interface ForecastImportReport {
  filename: string;
  /** Linhas válidas lidas do arquivo. */
  entries: number;
  /** Competências que o arquivo traz, em ordem. */
  competences: string[];
  /** Linhas que já existiam nessas competências e serão substituídas. */
  replaced: number;
  totals: { entradas: number; saidas: number };
  issues: ForecastIssue[];
  /** Linhas em branco ignoradas. */
  skipped: number;
  /** Falso quando é só conferência (`modo=conferir`). */
  applied: boolean;
}
