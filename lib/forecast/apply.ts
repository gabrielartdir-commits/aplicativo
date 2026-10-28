import "server-only";

/**
 * Gravação da planilha de próximos meses.
 *
 * A importação é por competência: para cada mês presente no arquivo, as
 * linhas antigas daquele mês saem e entram as do arquivo. Mês que o arquivo
 * não menciona não é tocado — é o que permite preencher um mês por vez e
 * reimportar um mês corrigido sem duplicar nada.
 *
 * Tudo numa transação: ou entra o arquivo inteiro, ou não entra nada.
 */

import { all, newId, nowIso, run, transaction } from "@/lib/db";
import { round2 } from "@/lib/finance";
import { competenceKey } from "./schema";
import type { ParsedEntry, ParseResult } from "./parse";
import type { ForecastImportReport } from "@/types/forecast";

/** Competências do arquivo, sem repetição, em ordem. */
function competencesOf(entries: ParsedEntry[]): { year: number; month: number }[] {
  const seen = new Map<string, { year: number; month: number }>();
  for (const entry of entries) {
    const key = `${entry.year}-${entry.month}`;
    if (!seen.has(key)) seen.set(key, { year: entry.year, month: entry.month });
  }
  return [...seen.values()].sort((a, b) => a.year - b.year || a.month - b.month);
}

/** Quantas linhas já gravadas serão substituídas por este arquivo. */
function countExisting(competences: { year: number; month: number }[]): number {
  let total = 0;
  for (const competence of competences) {
    const row = all<{ n: number }>(
      "SELECT COUNT(*) AS n FROM forecast_entries WHERE year = :year AND month = :month",
      competence
    )[0];
    total += Number(row?.n ?? 0);
  }
  return total;
}

interface ApplyOptions {
  filename: string;
  /** Falso só confere e devolve o relatório, sem gravar. */
  apply: boolean;
  /** Grava as linhas válidas mesmo havendo linhas com problema. */
  ignoreIssues: boolean;
}

export function applyForecastImport(
  parsed: ParseResult,
  { filename, apply, ignoreIssues }: ApplyOptions
): ForecastImportReport {
  const { entries, issues, skipped } = parsed;
  const competences = competencesOf(entries);

  const report: ForecastImportReport = {
    filename,
    entries: entries.length,
    competences: competences.map((c) => competenceKey(c.year, c.month)),
    replaced: countExisting(competences),
    totals: {
      entradas: round2(
        entries
          .filter((e) => e.kind === "entrada")
          .reduce((sum, e) => sum + e.amount, 0)
      ),
      saidas: round2(
        entries
          .filter((e) => e.kind === "saida")
          .reduce((sum, e) => sum + e.amount, 0)
      ),
    },
    issues,
    skipped,
    applied: false,
  };

  if (!apply) return report;

  if (issues.length > 0 && !ignoreIssues) {
    // Quem chama devolve o relatório com os erros; nada foi gravado.
    return report;
  }

  if (entries.length === 0) {
    throw new Error("Nenhuma linha válida para importar.");
  }

  const importId = newId();
  const now = nowIso();

  transaction(() => {
    run(
      `INSERT INTO forecast_imports
         (id, filename, entries_count, replaced_count, competences, imported_at)
       VALUES (:id, :filename, :entries, :replaced, :competences, :now)`,
      {
        id: importId,
        filename,
        entries: entries.length,
        replaced: report.replaced,
        competences: report.competences.join(", "),
        now,
      }
    );

    for (const competence of competences) {
      run(
        "DELETE FROM forecast_entries WHERE year = :year AND month = :month",
        competence
      );
    }

    for (const entry of entries) {
      run(
        `INSERT INTO forecast_entries
           (id, year, month, kind, group_name, name, amount, status, method,
            notes, import_id, source_row, created_at)
         VALUES (:id, :year, :month, :kind, :group_name, :name, :amount,
                 :status, :method, :notes, :import_id, :source_row, :now)`,
        {
          id: newId(),
          year: entry.year,
          month: entry.month,
          kind: entry.kind,
          group_name: entry.group_name,
          name: entry.name,
          amount: round2(entry.amount),
          status: entry.status,
          method: entry.method,
          notes: entry.notes,
          import_id: importId,
          source_row: entry.row,
          now,
        }
      );
    }
  });

  report.applied = true;
  return report;
}
