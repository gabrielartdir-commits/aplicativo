import "server-only";

/**
 * Leitura da planilha de próximos meses.
 *
 * Trabalha em cima do padrão de `./schema.ts` e não grava nada: devolve as
 * linhas válidas e a lista de problemas, para a importação poder mostrar o
 * que vai acontecer antes de aplicar. Quem grava é `./apply.ts`.
 *
 * O cabeçalho não precisa estar na primeira linha nem na ordem do modelo —
 * planilha preenchida à mão quase sempre ganha um título ou uma linha em
 * branco em cima. A linha de cabeçalho é procurada pelos nomes das colunas.
 */

import ExcelJS from "exceljs";
import {
  SHEET_NAME,
  EXAMPLE_SHEET,
  INSTRUCTIONS_SHEET,
  type ColumnId,
  matchColumn,
  parseAmount,
  parseCompetence,
  parseKind,
  parseMonth,
  parseStatus,
  parseYear,
} from "./schema";
import type {
  ForecastIssue,
  ForecastKind,
  ForecastStatus,
} from "@/types/forecast";

/** Teto de linhas lidas — protege contra um arquivo absurdo. */
const MAX_ROWS = 20000;
/** Até onde o cabeçalho é procurado. */
const HEADER_SEARCH_ROWS = 12;

export interface ParsedEntry {
  year: number;
  month: number;
  kind: ForecastKind;
  group_name: string;
  name: string;
  amount: number;
  status: ForecastStatus;
  method: string;
  notes: string;
  /** Linha do Excel de onde veio, para a mensagem de erro fazer sentido. */
  row: number;
}

export interface ParseResult {
  sheet: string;
  entries: ParsedEntry[];
  issues: ForecastIssue[];
  /** Linhas em branco ignoradas. */
  skipped: number;
}

/** Texto de uma célula, qualquer que seja o formato que o ExcelJS devolva. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  if (typeof value === "object") {
    const object = value as unknown as Record<string, unknown>;
    if ("text" in object) return String(object.text ?? "").trim();
    if ("result" in object) return cellText(object.result as ExcelJS.CellValue);
    if ("richText" in object) {
      const parts = object.richText as { text?: string }[];
      return parts.map((part) => part.text ?? "").join("").trim();
    }
    if ("hyperlink" in object) return String(object.hyperlink ?? "").trim();
  }
  return String(value).trim();
}

/** Valor cru, preservando número e data — o texto perde a precisão. */
function cellRaw(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || value instanceof Date) return value;
  if (typeof value === "object") {
    const object = value as unknown as Record<string, unknown>;
    if ("result" in object) return cellRaw(object.result as ExcelJS.CellValue);
  }
  return cellText(value);
}

function sheetFor(book: ExcelJS.Workbook): ExcelJS.Worksheet | null {
  const wanted = SHEET_NAME.toLowerCase();
  const byName = book.worksheets.find(
    (sheet) => sheet.name.trim().toLowerCase() === wanted
  );
  if (byName) return byName;

  // Sem a aba do padrão, vale a primeira que tenha um cabeçalho reconhecível:
  // assim também serve a aba "Próximos meses" da planilha de exportação, ou
  // uma planilha que o Gabriel montou à mão com outro nome de aba.
  const ignored = [INSTRUCTIONS_SHEET, EXAMPLE_SHEET].map((n) =>
    n.toLowerCase()
  );
  const candidates = book.worksheets.filter(
    (sheet) => !ignored.includes(sheet.name.trim().toLowerCase())
  );
  return (
    candidates.find((sheet) => findHeader(sheet) !== null) ??
    candidates[0] ??
    book.worksheets[0] ??
    null
  );
}

/** Acha a linha de cabeçalho e o mapa coluna → índice do Excel. */
function findHeader(
  sheet: ExcelJS.Worksheet
): { row: number; map: Map<ColumnId, number> } | null {
  const limit = Math.min(sheet.rowCount, HEADER_SEARCH_ROWS);

  for (let r = 1; r <= limit; r++) {
    const row = sheet.getRow(r);
    const map = new Map<ColumnId, number>();

    row.eachCell({ includeEmpty: false }, (cell, index) => {
      const id = matchColumn(cellText(cell.value));
      if (id && !map.has(id)) map.set(id, index);
    });

    const hasCompetence =
      map.has("competence") || (map.has("year") && map.has("month"));
    if (map.has("name") && map.has("amount") && hasCompetence) {
      return { row: r, map };
    }
  }
  return null;
}

export async function parseForecastWorkbook(
  data: ArrayBuffer
): Promise<ParseResult> {
  const book = new ExcelJS.Workbook();
  try {
    await book.xlsx.load(data);
  } catch {
    // O erro do leitor de zip ("can't find end of central directory") não diz
    // nada a quem só quer saber que o arquivo está errado.
    throw new Error(
      "Não consegui abrir o arquivo como planilha. Confira se é mesmo um .xlsx — se tiver renomeado a extensão, abra no Excel e use Salvar como."
    );
  }

  const sheet = sheetFor(book);
  if (!sheet) {
    throw new Error("A planilha está vazia — nenhuma aba foi encontrada.");
  }

  const header = findHeader(sheet);
  if (!header) {
    throw new Error(
      `Não achei o cabeçalho na aba "${sheet.name}". Ela precisa ter as colunas Descrição, Valor e Competência (ou Ano e Mês). Baixe o modelo pelo botão ao lado para partir do formato certo.`
    );
  }

  const { map } = header;
  const entries: ParsedEntry[] = [];
  const issues: ForecastIssue[] = [];
  let skipped = 0;

  const text = (row: ExcelJS.Row, id: ColumnId): string => {
    const index = map.get(id);
    return index === undefined ? "" : cellText(row.getCell(index).value);
  };
  const raw = (row: ExcelJS.Row, id: ColumnId): unknown => {
    const index = map.get(id);
    return index === undefined ? "" : cellRaw(row.getCell(index).value);
  };

  const lastRow = Math.min(sheet.rowCount, header.row + MAX_ROWS);

  for (let r = header.row + 1; r <= lastRow; r++) {
    const row = sheet.getRow(r);

    const name = text(row, "name");
    const amountCell = raw(row, "amount");
    const groupName = text(row, "group");
    const method = text(row, "method");
    const notes = text(row, "notes");
    const competenceCell = raw(row, "competence");
    const yearCell = raw(row, "year");
    const monthCell = raw(row, "month");

    const filled = [
      name,
      String(amountCell ?? ""),
      groupName,
      method,
      notes,
    ].some((value) => value.trim() !== "");

    // Linha só com a competência arrastada para baixo também é vazia.
    if (!filled) {
      skipped++;
      continue;
    }

    const rowIssues: string[] = [];

    let competence = parseCompetence(competenceCell);
    if (!competence) {
      const year = parseYear(yearCell);
      const month = parseMonth(monthCell);
      if (year && month) competence = { year, month };
    }
    if (!competence) {
      const written = [competenceCell, yearCell, monthCell]
        .map((value) => String(value ?? "").trim())
        .filter((value) => value !== "")
        .join(" ");
      rowIssues.push(
        written === ""
          ? "sem competência — preencha o mês, como 11/2026"
          : `não entendi a competência "${written}" — use 11/2026 ou o nome do mês`
      );
    }

    if (name.trim() === "") rowIssues.push("sem descrição");

    const amount = parseAmount(amountCell);
    if (amount === null) {
      const written = String(amountCell ?? "").trim();
      rowIssues.push(
        written === ""
          ? "sem valor"
          : `o valor "${written}" não é um número`
      );
    }

    const kind = parseKind(text(row, "kind"));
    if (!kind) {
      rowIssues.push(
        `não entendi o tipo "${text(row, "kind")}" — use "saída" ou "entrada"`
      );
    }

    const status = parseStatus(text(row, "status"));
    if (!status) {
      rowIssues.push(
        `não entendi o status "${text(row, "status")}" — use "previsto", "confirmado" ou "pago"`
      );
    }

    if (rowIssues.length > 0) {
      issues.push({ row: r, message: rowIssues.join("; ") });
      continue;
    }

    entries.push({
      year: competence!.year,
      month: competence!.month,
      kind: kind!,
      group_name: groupName.trim(),
      name: name.trim(),
      // Planilha com as saídas em negativo é comum; o sinal já está no tipo.
      amount: Math.abs(amount!),
      status: status!,
      method: method.trim(),
      notes: notes.trim(),
      row: r,
    });
  }

  if (entries.length === 0 && issues.length === 0) {
    throw new Error(
      `A aba "${sheet.name}" tem o cabeçalho certo, mas nenhuma linha preenchida.`
    );
  }

  return { sheet: sheet.name, entries, issues, skipped };
}
