import "server-only";

/**
 * Leitura da planilha mensal.
 *
 * Não grava nada: devolve o conteúdo entendido (`SheetPayload`) e a lista de
 * problemas, para a tela poder mostrar o que vai acontecer antes de aplicar.
 * Quem grava é `./import.ts`.
 *
 * Duas decisões que valem explicar:
 *
 *   * A competência sai da aba "Mês" e vale para a planilha inteira. É o que
 *     permite escrever só o dia na coluna Data e o que faz a importação ser
 *     substituível por mês.
 *   * Problema de linha não interrompe a leitura. Cada linha ruim entra em
 *     `issues` com o nome da aba e o número da linha do Excel, e as outras
 *     continuam sendo lidas — uma planilha de 300 linhas não pode parar na
 *     primeira célula digitada errado.
 */

import ExcelJS from "exceljs";
import { SHEETS, type SheetId, type SheetSpec } from "./schema";
import {
  normalize,
  parseAdjustmentType,
  parseAmount,
  parseBool,
  parseCompetence,
  parseDate,
  parseDay,
  parseMonth,
  parsePaymentMethod,
  parseTransactionKind,
  parseYear,
} from "./values";
import type {
  SheetIssue,
  SheetPayload,
  SheetTransactionRow,
} from "@/types/sheet";

/** Teto de linhas lidas por aba — protege contra um arquivo absurdo. */
const MAX_ROWS = 20000;
/** Até onde o cabeçalho é procurado (planilha à mão costuma ter título). */
const HEADER_SEARCH_ROWS = 12;

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
      return parts
        .map((part) => part.text ?? "")
        .join("")
        .trim();
    }
    if ("hyperlink" in object) return String(object.hyperlink ?? "").trim();
  }
  return String(value).trim();
}

/** Valor cru, preservando número e data — o texto perde a precisão. */
function cellRaw(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || value instanceof Date) return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "object") {
    const object = value as unknown as Record<string, unknown>;
    if ("result" in object) return cellRaw(object.result as ExcelJS.CellValue);
  }
  return cellText(value);
}

function matchColumn(spec: SheetSpec, header: unknown): string | null {
  const key = normalize(header).replace(/[:.*]+$/, "");
  if (key === "") return null;
  for (const column of spec.columns) {
    if (normalize(column.header) === key) return column.id;
    if (column.aliases.includes(key)) return column.id;
  }
  return null;
}

/** A aba de uma spec, procurada pelo nome e pelos apelidos. */
function findSheet(
  book: ExcelJS.Workbook,
  spec: SheetSpec
): ExcelJS.Worksheet | null {
  const wanted = [normalize(spec.name), ...spec.aliases];
  return (
    book.worksheets.find((sheet) => wanted.includes(normalize(sheet.name))) ??
    null
  );
}

/**
 * Acha a linha de cabeçalho e o mapa coluna → índice.
 *
 * Vale a linha que reconhece ao menos duas colunas do padrão — uma só pode
 * ser coincidência (um título escrito "Valor" acima da tabela, por exemplo).
 * Abas de uma coluna só não existem no padrão.
 */
function findHeader(
  sheet: ExcelJS.Worksheet,
  spec: SheetSpec
): { row: number; map: Map<string, number> } | null {
  const limit = Math.min(sheet.rowCount, HEADER_SEARCH_ROWS);
  let best: { row: number; map: Map<string, number> } | null = null;

  for (let r = 1; r <= limit; r++) {
    const map = new Map<string, number>();
    sheet.getRow(r).eachCell({ includeEmpty: false }, (cell, index) => {
      const id = matchColumn(spec, cellText(cell.value));
      if (id && !map.has(id)) map.set(id, index);
    });
    if (map.size >= 2 && (!best || map.size > best.map.size)) {
      best = { row: r, map };
    }
    // Cabeçalho completo: não há motivo para continuar procurando.
    if (best && best.map.size === spec.columns.length) break;
  }
  return best;
}

type Reader = {
  text: (id: string) => string;
  raw: (id: string) => unknown;
  has: (id: string) => boolean;
};

function readerFor(row: ExcelJS.Row, map: Map<string, number>): Reader {
  return {
    text: (id) => {
      const index = map.get(id);
      return index === undefined ? "" : cellText(row.getCell(index).value);
    },
    raw: (id) => {
      const index = map.get(id);
      return index === undefined ? "" : cellRaw(row.getCell(index).value);
    },
    has: (id) => map.has(id),
  };
}

/** Coleta os problemas de uma linha e só devolve o objeto se não houver nenhum. */
class RowErrors {
  private list: string[] = [];

  add(message: string): void {
    this.list.push(message);
  }

  /** `parseAmount` etc. devolvem null; isto encurta o "se null, reclama". */
  need<T>(value: T | null, message: string): T | null {
    if (value === null || value === undefined) {
      this.add(message);
      return null;
    }
    return value;
  }

  get ok(): boolean {
    return this.list.length === 0;
  }

  get message(): string {
    return this.list.join("; ");
  }
}

export interface SheetReadResult extends SheetPayload {
  /** Abas lidas, com quantas linhas vieram de cada. */
  readSheets: { sheet: string; rows: number }[];
}

/**
 * Percorre as linhas de uma aba chamando `mapRow`.
 *
 * `mapRow` devolve o objeto da linha, ou `null` quando a linha está em branco
 * (ignorada em silêncio) ou quando ela tem erro (que `errors` já registrou).
 */
function eachRow<T>(
  sheet: ExcelJS.Worksheet,
  spec: SheetSpec,
  issues: SheetIssue[],
  mapRow: (read: Reader, errors: RowErrors) => T | null
): T[] {
  const header = findHeader(sheet, spec);
  if (!header) {
    issues.push({
      sheet: sheet.name,
      row: 1,
      message: `não achei o cabeçalho desta aba. Ela precisa ter a linha com os nomes das colunas (${spec.columns
        .slice(0, 3)
        .map((c) => c.header)
        .join(", ")}…). Baixe o modelo para partir do formato certo.`,
    });
    return [];
  }

  const out: T[] = [];
  const last = Math.min(sheet.rowCount, header.row + MAX_ROWS);

  for (let r = header.row + 1; r <= last; r++) {
    const row = sheet.getRow(r);
    const read = readerFor(row, header.map);

    // Linha em branco (inclusive a que só tem fórmula vazia) é ignorada.
    const filled = spec.columns.some(
      (column) => read.text(column.id).trim() !== ""
    );
    if (!filled) continue;

    const errors = new RowErrors();
    const mapped = mapRow(read, errors);
    if (!errors.ok) {
      issues.push({ sheet: sheet.name, row: r, message: errors.message });
      continue;
    }
    if (mapped !== null) out.push(mapped);
  }

  return out;
}

const money = (read: Reader, errors: RowErrors, id: string, label: string) =>
  errors.need(parseAmount(read.raw(id)), `${label} inválido ou em branco`);

const required = (read: Reader, errors: RowErrors, id: string, label: string) => {
  const text = read.text(id).trim();
  if (text === "") {
    errors.add(`sem ${label}`);
    return null;
  }
  return text;
};

export async function readWorkbook(
  data: ArrayBuffer
): Promise<SheetReadResult> {
  const book = new ExcelJS.Workbook();
  try {
    await book.xlsx.load(data);
  } catch {
    // O erro do leitor de zip não diz nada a quem só quer saber que o
    // arquivo está errado.
    throw new Error(
      "Não consegui abrir o arquivo como planilha. Confira se é mesmo um .xlsx — se tiver renomeado a extensão, abra no Excel e use Salvar como."
    );
  }

  const issues: SheetIssue[] = [];
  const readSheets: { sheet: string; rows: number }[] = [];
  const missingSheets: string[] = [];

  const sheets = new Map<SheetId, ExcelJS.Worksheet | null>();
  for (const spec of SHEETS) {
    const found = findSheet(book, spec);
    sheets.set(spec.id, found);
    if (!found) missingSheets.push(spec.name);
  }

  const specOf = (id: SheetId) => SHEETS.find((s) => s.id === id)!;

  // ---------------------------------------------------------------- Mês
  //
  // A competência vem primeiro porque tudo depende dela: é ela que diz a que
  // mês o arquivo pertence e que completa as datas escritas só com o dia.
  const monthSheet = sheets.get("month");
  const monthSpec = specOf("month");
  if (!monthSheet) {
    const names = book.worksheets.map((s) => s.name).join(", ");
    throw new Error(
      `A planilha não tem a aba "${monthSpec.name}", que diz de qual mês ela é. Abas encontradas: ${names || "nenhuma"}. Baixe o modelo em Configurações para partir do formato certo.`
    );
  }

  const monthRows = eachRow(monthSheet, monthSpec, issues, (read, errors) => {
    let competence = parseCompetence(read.raw("competence"));
    if (!competence) {
      // Alguém pode ter separado em duas colunas, como no app.
      const year = parseYear(read.raw("competence"));
      const month = parseMonth(read.text("competence"));
      if (year && month) competence = { year, month };
    }
    if (!competence) {
      const written = read.text("competence").trim();
      errors.add(
        written === ""
          ? "sem competência — escreva o mês, como 11/2026"
          : `não entendi a competência "${written}" — use 11/2026 ou nov/26`
      );
      return null;
    }

    const optional = (id: string) => {
      const raw = read.raw(id);
      if (String(raw ?? "").trim() === "") return null;
      const parsed = parseAmount(raw);
      if (parsed === null) {
        errors.add(`o valor "${read.text(id)}" não é um número`);
        return null;
      }
      return parsed;
    };

    return {
      year: competence.year,
      month: competence.month,
      startingBalance: optional("startingBalance"),
      salary: optional("salary"),
      extraIncome: optional("extraIncome"),
    };
  });

  const monthRow = monthRows[0] ?? null;
  if (!monthRow) {
    throw new Error(
      `A aba "${monthSpec.name}" está sem a competência. Escreva na coluna ${monthSpec.columns[0].header} de qual mês é esta planilha, como 11/2026.`
    );
  }
  if (monthRows.length > 1) {
    issues.push({
      sheet: monthSheet.name,
      row: 3,
      message:
        "esta aba tem mais de um mês preenchido. A planilha é de um mês só — vale a primeira linha, e as outras foram ignoradas.",
    });
  }
  readSheets.push({ sheet: monthSpec.name, rows: 1 });

  const competence = { year: monthRow.year, month: monthRow.month };

  // ------------------------------------------------------------ cadastro
  const spec = <T>(
    id: SheetId,
    mapRow: (read: Reader, errors: RowErrors) => T | null
  ): T[] => {
    const sheet = sheets.get(id);
    const current = specOf(id);
    if (!sheet) return [];
    const rows = eachRow(sheet, current, issues, mapRow);
    readSheets.push({ sheet: current.name, rows: rows.length });
    return rows;
  };

  const categories = spec("categories", (read, errors) => {
    const name = required(read, errors, "name", "nome da categoria");
    const limit = read.text("limit").trim() === ""
      ? null
      : parseAmount(read.raw("limit"));
    if (!errors.ok || !name) return null;
    return { name, emoji: read.text("emoji").trim(), limit };
  });

  const cards = spec("cards", (read, errors) => {
    const name = required(read, errors, "name", "nome do cartão");
    const closingDay = parseDay(read.raw("closingDay"));
    const dueDay = parseDay(read.raw("dueDay"));
    if (read.text("closingDay").trim() !== "" && closingDay === null) {
      errors.add(`o dia de fechamento "${read.text("closingDay")}" não é um dia de 1 a 31`);
    }
    if (read.text("dueDay").trim() !== "" && dueDay === null) {
      errors.add(`o dia de vencimento "${read.text("dueDay")}" não é um dia de 1 a 31`);
    }
    if (!errors.ok || !name) return null;
    return {
      name,
      closingDay: closingDay ?? 1,
      dueDay: dueDay ?? 10,
      creditLimit:
        read.text("creditLimit").trim() === ""
          ? null
          : parseAmount(read.raw("creditLimit")),
    };
  });

  const incomes = spec("incomes", (read, errors) => {
    const name = required(read, errors, "name", "nome da entrada");
    const amount = money(read, errors, "amount", "valor");
    const active = errors.need(
      parseBool(read.text("active"), true),
      `não entendi o "Ativo" ("${read.text("active")}") — use sim ou não`
    );
    if (!errors.ok || !name || amount === null) return null;
    return { name, amount: Math.abs(amount), active: active ?? true };
  });

  const fixed = spec("fixed", (read, errors) => {
    const name = required(read, errors, "name", "nome da conta");
    const amount = money(read, errors, "amount", "valor");
    const dueDay = parseDay(read.raw("dueDay"));
    if (read.text("dueDay").trim() !== "" && dueDay === null) {
      errors.add(`o dia "${read.text("dueDay")}" não é um dia de 1 a 31`);
    }
    const paid = errors.need(
      parseBool(read.text("paid"), false),
      `não entendi o "Pago" ("${read.text("paid")}") — use sim ou não`
    );
    const active = errors.need(
      parseBool(read.text("active"), true),
      `não entendi o "Ativo" ("${read.text("active")}") — use sim ou não`
    );
    if (!errors.ok || !name || amount === null) return null;
    return {
      name,
      amount: Math.abs(amount),
      dueDay: dueDay ?? 0,
      active: active ?? true,
      paid: paid ?? false,
    };
  });

  const subscriptions = spec("subscriptions", (read, errors) => {
    const name = required(read, errors, "name", "nome da assinatura");
    const amount = money(read, errors, "amount", "valor");
    const method = errors.need(
      parsePaymentMethod(read.text("method")),
      `não entendi a forma "${read.text("method")}" — use crédito ou débito`
    );
    const billingDay = parseDay(read.raw("billingDay"));
    if (read.text("billingDay").trim() !== "" && billingDay === null) {
      errors.add(`o dia "${read.text("billingDay")}" não é um dia de 1 a 31`);
    }
    const active = errors.need(
      parseBool(read.text("active"), true),
      `não entendi o "Ativo" ("${read.text("active")}") — use sim ou não`
    );
    const cardName = read.text("card").trim();
    if (method === "credit" && cardName === "") {
      errors.add(
        "assinatura no crédito precisa do cartão — escreva o nome do cartão, ou troque a forma para débito"
      );
    }
    if (!errors.ok || !name || amount === null) return null;
    return {
      name,
      amount: Math.abs(amount),
      billingDay: billingDay ?? 0,
      method: method ?? "credit",
      cardName,
      categoryName: read.text("category").trim(),
      active: active ?? true,
    };
  });

  const purchases = spec("purchases", (read, errors) => {
    const description = required(read, errors, "description", "descrição");
    const cardName = required(read, errors, "card", "cartão");
    const totalAmount = money(read, errors, "totalAmount", "valor total");

    const countRaw = read.raw("installmentsCount");
    const count = parseAmount(countRaw);
    if (count === null || !Number.isInteger(count) || count < 1 || count > 120) {
      errors.add(
        `o número de parcelas "${read.text("installmentsCount")}" precisa ser um inteiro de 1 a 120`
      );
    }

    const currentText = read.text("currentInstallment").trim();
    const currentRaw = currentText === "" ? 1 : parseAmount(read.raw("currentInstallment"));
    const current = currentRaw === null ? null : Math.trunc(currentRaw);
    if (current === null || current < 1) {
      errors.add(`a parcela atual "${currentText}" precisa ser um número a partir de 1`);
    } else if (count !== null && current > count) {
      errors.add(
        `a parcela atual (${current}) é maior que o total de parcelas (${count})`
      );
    }

    const dateText = read.text("purchaseDate").trim();
    const purchaseDate =
      dateText === ""
        ? `${competence.year}-${String(competence.month).padStart(2, "0")}-01`
        : parseDate(read.raw("purchaseDate"), competence);
    if (dateText !== "" && purchaseDate === null) {
      errors.add(`não entendi a data "${dateText}" — use 15/11/2026`);
    }

    if (!errors.ok || !description || !cardName || totalAmount === null) {
      return null;
    }
    return {
      description,
      cardName,
      categoryName: read.text("category").trim(),
      totalAmount: Math.abs(totalAmount),
      installmentsCount: count!,
      currentInstallment: current!,
      purchaseDate: purchaseDate!,
    };
  });

  // ------------------------------------------------------------ movimento
  const transactions = spec<SheetTransactionRow>("transactions", (read, errors) => {
    const description = required(read, errors, "description", "descrição");
    const amount = money(read, errors, "amount", "valor");
    const kind = errors.need(
      parseTransactionKind(read.text("kind")),
      `não entendi o tipo "${read.text("kind")}" — use gasto ou receita`
    );

    const dateText = read.text("date").trim();
    const date =
      dateText === ""
        ? `${competence.year}-${String(competence.month).padStart(2, "0")}-01`
        : parseDate(read.raw("date"), competence);
    if (dateText !== "" && date === null) {
      errors.add(`não entendi a data "${dateText}" — use 15/11/2026 ou só o dia`);
    }

    if (amount !== null && Math.abs(amount) === 0) {
      errors.add("valor zero — o app não aceita lançamento de R$ 0,00");
    }

    if (!errors.ok || !description || amount === null) return null;
    return {
      date: date!,
      description,
      categoryName: read.text("category").trim(),
      kind: kind ?? "expense",
      // Gasto em negativo é comum no extrato; o sinal vem do tipo.
      amount: Math.abs(amount),
    };
  });

  const investments = spec("investments", (read, errors) => {
    const amount = money(read, errors, "amount", "valor");
    if (amount !== null && Math.abs(amount) === 0) {
      errors.add("valor zero — aporte de R$ 0,00 não é aporte");
    }
    if (!errors.ok || amount === null) return null;
    return {
      amount: Math.abs(amount),
      description: read.text("description").trim(),
    };
  });

  const adjustments = spec("adjustments", (read, errors) => {
    const type = errors.need(
      parseAdjustmentType(read.text("type")),
      `não entendi o tipo "${read.text("type")}" — use correção, entrada, saída ou transferência`
    );
    const amount = money(read, errors, "amount", "valor");
    if (!errors.ok || amount === null) return null;
    return {
      type: type ?? "correction",
      amount,
      description: read.text("description").trim(),
    };
  });

  return {
    monthRow,
    categories,
    cards,
    incomes,
    fixed,
    subscriptions,
    purchases,
    transactions,
    investments,
    adjustments,
    issues,
    missingSheets,
    readSheets,
  };
}
