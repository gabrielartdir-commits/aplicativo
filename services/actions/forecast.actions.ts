"use server";

/**
 * Leitura e limpeza do espaço "Próximos meses".
 *
 * Só toca em `forecast_entries` e `forecast_imports`, as duas tabelas da
 * previsão. Nenhum cálculo do app (saldo, disponível, reservas, faturas) lê
 * essas tabelas, nem este arquivo lê as do app.
 *
 * A gravação da planilha fica em `lib/forecast/apply.ts`, chamada pela rota
 * de importação — ela recebe um arquivo, o que uma Server Action não faz bem.
 */

import { all, run } from "@/lib/db";
import { round2 } from "@/lib/finance";
import { shortCompetenceLabel } from "@/lib/dates";
import type {
  ForecastEntry,
  ForecastImportLog,
  ForecastMonth,
  ForecastSummary,
} from "@/types/forecast";

/**
 * Grupo em branco na planilha aparece assim na tela.
 *
 * Sem `export`: num arquivo "use server" só funções assíncronas podem ser
 * exportadas, e uma constante exportada daqui quebra o build inteiro.
 */
const NO_GROUP = "Sem grupo";

const ENTRY_ORDER = `ORDER BY year, month,
  CASE kind WHEN 'entrada' THEN 0 ELSE 1 END,
  amount DESC, name`;

export async function listForecastEntries(): Promise<ForecastEntry[]> {
  return all<ForecastEntry>(`SELECT * FROM forecast_entries ${ENTRY_ORDER}`);
}

export async function getLastForecastImport(): Promise<ForecastImportLog | null> {
  return (
    all<ForecastImportLog>(
      "SELECT * FROM forecast_imports ORDER BY imported_at DESC LIMIT 1"
    )[0] ?? null
  );
}

/**
 * Totais por competência e por grupo.
 *
 * Soma no servidor para a tela receber o que desenhar, sem percorrer todos os
 * lançamentos no navegador a cada troca de aba.
 */
export async function getForecastSummary(): Promise<ForecastSummary> {
  const rows = all<{
    year: number;
    month: number;
    kind: string;
    group_name: string;
    total: number;
    count: number;
  }>(
    `SELECT year, month, kind, group_name,
            SUM(amount) AS total, COUNT(*) AS count
       FROM forecast_entries
      GROUP BY year, month, kind, group_name
      ORDER BY year, month`
  );

  const months = new Map<string, ForecastMonth>();
  const groups = new Map<string, number>();

  for (const row of rows) {
    const key = `${row.year}-${String(row.month).padStart(2, "0")}`;
    const month =
      months.get(key) ??
      ({
        year: row.year,
        month: row.month,
        competence: shortCompetenceLabel({ year: row.year, month: row.month }),
        entradas: 0,
        saidas: 0,
        saldo: 0,
        groups: {},
        count: 0,
      } satisfies ForecastMonth);

    const total = Number(row.total);
    const group = row.group_name.trim() === "" ? NO_GROUP : row.group_name;

    if (row.kind === "entrada") {
      month.entradas += total;
    } else {
      month.saidas += total;
      month.groups[group] = round2((month.groups[group] ?? 0) + total);
      groups.set(group, round2((groups.get(group) ?? 0) + total));
    }

    month.count += Number(row.count);
    months.set(key, month);
  }

  const list = [...months.values()]
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .map((month) => ({
      ...month,
      entradas: round2(month.entradas),
      saidas: round2(month.saidas),
      saldo: round2(month.entradas - month.saidas),
    }));

  return {
    months: list,
    groups: [...groups.entries()]
      .map(([name, total]) => ({ name, total: round2(total) }))
      .sort((a, b) => b.total - a.total),
    last: await getLastForecastImport(),
  };
}

/** Apaga a previsão de uma competência. Não mexe nos outros meses. */
export async function deleteForecastCompetence(
  year: number,
  month: number
): Promise<void> {
  run("DELETE FROM forecast_entries WHERE year = :year AND month = :month", {
    year,
    month,
  });
}

/** Esvazia o espaço inteiro — previsão e histórico de importações. */
export async function clearForecast(): Promise<void> {
  run("DELETE FROM forecast_entries");
  run("DELETE FROM forecast_imports");
}
