import "server-only";

/**
 * Gera o modelo da planilha mensal.
 *
 * O modelo sai do mesmo `./schema.ts` que o leitor usa, e vem com o cadastro
 * atual do app já preenchido: contas fixas, assinaturas, cartões, parcelas em
 * andamento, categorias e entradas fixas. A ideia é que o mês seja preenchido
 * CORRIGINDO valores, não digitando tudo de novo — e que a planilha que volta
 * seja reconhecida linha por linha, porque os nomes são os mesmos.
 *
 * A aba "Como preencher" é gerada a partir dos campos `purpose`, `rule` e
 * `help` do padrão: a documentação não pode viver longe do formato, senão
 * envelhece sozinha.
 */

import ExcelJS from "exceljs";
import { all } from "@/lib/db";
import { monthName } from "./values";
import { INSTRUCTIONS_SHEET, SHEETS, type SheetSpec } from "./schema";

const HEADER_FILL = "FF0F766E";
const TITLE_COLOR = "FF0F766E";
const MONEY = "R$ #,##0.00";

const pad = (n: number) => String(n).padStart(2, "0");

export interface TemplateResult {
  buffer: Buffer;
  filename: string;
}

/** Competência que o modelo traz pronta: o mês aberto do app, ou hoje. */
function templateCompetence(): { year: number; month: number } {
  const row = all<{ year: number; month: number }>(
    "SELECT year, month FROM months WHERE closed = 0 ORDER BY year DESC, month DESC LIMIT 1"
  )[0];
  if (row) return { year: Number(row.year), month: Number(row.month) };

  const latest = all<{ year: number; month: number }>(
    "SELECT year, month FROM months ORDER BY year DESC, month DESC LIMIT 1"
  )[0];
  if (latest) return { year: Number(latest.year), month: Number(latest.month) };

  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/** Linha de cabeçalho formatada, larguras e painel congelado. */
function writeHeader(sheet: ExcelJS.Worksheet, spec: SheetSpec): void {
  sheet.columns = spec.columns.map((column) => ({
    key: column.id,
    width: column.width,
  }));

  const header = sheet.addRow(
    Object.fromEntries(spec.columns.map((c) => [c.id, c.header]))
  );
  header.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: HEADER_FILL },
  };
  header.alignment = { vertical: "middle" };
  header.height = 22;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

/**
 * Formato de moeda e listas de validação até a última linha útil.
 *
 * A validação vai além das linhas preenchidas de propósito: é ela que faz o
 * Excel oferecer o menu ao digitar numa linha nova.
 */
function formatBody(sheet: ExcelJS.Worksheet, spec: SheetSpec): void {
  const last = Math.max(sheet.rowCount, spec.rows + 1);

  spec.columns.forEach((column, index) => {
    const position = index + 1;
    if (column.money) {
      sheet.getColumn(position).numFmt = MONEY;
    }
    if (!column.list) return;

    for (let r = 2; r <= last; r++) {
      sheet.getCell(r, position).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`"${column.list.join(",")}"`],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: column.header,
        error: `Use: ${column.list.join(", ")}`,
      };
    }
  });
}

interface Registry {
  categories: { name: string; emoji: string; limit: number }[];
  cards: { name: string; closing: number; due: number; limit: number }[];
  incomes: { name: string; amount: number; active: boolean }[];
  fixed: {
    name: string;
    amount: number;
    due: number;
    active: boolean;
    paid: boolean;
  }[];
  subscriptions: {
    name: string;
    amount: number;
    day: number;
    method: string;
    card: string;
    category: string;
    active: boolean;
  }[];
  purchases: {
    description: string;
    card: string;
    category: string;
    total: number;
    count: number;
    current: number;
    date: string;
  }[];
  month: {
    startingBalance: number | null;
    salary: number | null;
    extraIncome: number | null;
  };
}

/** O cadastro do app na competência do modelo. */
function readRegistry(competence: { year: number; month: number }): Registry {
  const monthRow = all<{
    id: string;
    starting_balance: number;
    salary: number;
    extra_income: number;
  }>(
    `SELECT id, starting_balance, salary, extra_income FROM months
      WHERE year = :year AND month = :month`,
    competence
  )[0];

  const paidIds = new Set(
    monthRow
      ? all<{ fixed_expense_id: string }>(
          "SELECT fixed_expense_id FROM fixed_expense_payments WHERE month_id = :id",
          { id: monthRow.id }
        ).map((row) => row.fixed_expense_id)
      : []
  );

  return {
    categories: all<{ name: string; emoji: string; default_limit: number }>(
      "SELECT name, emoji, default_limit FROM categories ORDER BY sort_order, name"
    ).map((row) => ({
      name: row.name,
      emoji: row.emoji ?? "",
      limit: Number(row.default_limit),
    })),

    cards: all<{
      name: string;
      closing_day: number;
      due_day: number;
      credit_limit: number;
    }>(
      "SELECT name, closing_day, due_day, credit_limit FROM credit_cards WHERE active = 1 ORDER BY name"
    ).map((row) => ({
      name: row.name,
      closing: Number(row.closing_day),
      due: Number(row.due_day),
      limit: Number(row.credit_limit),
    })),

    incomes: all<{ name: string; amount: number; active: number }>(
      "SELECT name, amount, active FROM recurring_incomes ORDER BY sort_order, name"
    ).map((row) => ({
      name: row.name,
      amount: Number(row.amount),
      active: Boolean(row.active),
    })),

    fixed: all<{
      id: string;
      name: string;
      amount: number;
      due_day: number;
      active: number;
    }>(
      "SELECT id, name, amount, due_day, active FROM fixed_expenses ORDER BY due_day, name"
    ).map((row) => ({
      name: row.name,
      amount: Number(row.amount),
      due: Number(row.due_day),
      active: Boolean(row.active),
      paid: paidIds.has(row.id),
    })),

    subscriptions: all<{
      name: string;
      amount: number;
      billing_day: number;
      payment_method: string;
      active: number;
      card_name: string | null;
      category_name: string | null;
    }>(
      `SELECT s.name, s.amount, s.billing_day, s.payment_method, s.active,
              c.name AS card_name, k.name AS category_name
         FROM subscriptions s
         LEFT JOIN credit_cards c ON c.id = s.card_id
         LEFT JOIN categories k ON k.id = s.category_id
        ORDER BY s.billing_day, s.name`
    ).map((row) => ({
      name: row.name,
      amount: Number(row.amount),
      day: Number(row.billing_day),
      method: row.payment_method === "debit" ? "débito" : "crédito",
      card: row.card_name ?? "",
      category: row.category_name ?? "",
      active: Boolean(row.active),
    })),

    /*
     * Só as compras com uma parcela caindo NESTA competência.
     *
     * São as que o mês enxerga, e são as que a importação consegue
     * reconstruir: ela reancora as parcelas a partir da "Parcela atual" no mês
     * da planilha. Compra já quitada, ou que só começa depois, fica fora da
     * planilha — e, por não estar nela, a importação não mexe nela.
     */
    purchases: all<{
      description: string;
      total_amount: number;
      installments_count: number;
      installment_no: number;
      purchase_date: string;
      card_name: string;
      category_name: string | null;
    }>(
      `SELECT p.description, p.total_amount, p.installments_count,
              i.installment_no, p.purchase_date,
              c.name AS card_name, k.name AS category_name
         FROM card_installments i
         JOIN card_purchases p ON p.id = i.purchase_id
         JOIN credit_cards c ON c.id = p.card_id
         LEFT JOIN categories k ON k.id = p.category_id
        WHERE i.year = :year AND i.month = :month
        ORDER BY p.description`,
      competence
    ).map((row) => ({
      description: row.description,
      card: row.card_name,
      category: row.category_name ?? "",
      total: Number(row.total_amount),
      count: Number(row.installments_count),
      current: Number(row.installment_no),
      date: row.purchase_date,
    })),

    month: {
      startingBalance: monthRow ? Number(monthRow.starting_balance) : null,
      salary: monthRow ? Number(monthRow.salary) : null,
      extraIncome: monthRow ? Number(monthRow.extra_income) : null,
    },
  };
}

/** Bloco de instruções de uma aba. */
function writeInstructionsFor(
  sheet: ExcelJS.Worksheet,
  spec: SheetSpec
): void {
  const title = sheet.addRow([`Aba "${spec.name}"`]);
  title.font = { bold: true, size: 12, color: { argb: TITLE_COLOR } };

  const purpose = sheet.addRow([spec.purpose]);
  purpose.font = { italic: true, size: 10 };

  const rule = sheet.addRow([`Ao importar: ${spec.rule}`]);
  rule.font = { size: 10 };
  rule.alignment = { wrapText: true, vertical: "top" };
  rule.height = 30;

  for (const column of spec.columns) {
    const row = sheet.addRow([`${column.header} — ${column.help}`]);
    row.font = { size: 10 };
    row.alignment = { wrapText: true, vertical: "top", indent: 1 };
    row.height = column.help.length > 110 ? 42 : 28;
  }

  sheet.addRow([]);
}

function writeInstructions(
  book: ExcelJS.Workbook,
  competence: { year: number; month: number }
): void {
  const sheet = book.addWorksheet(INSTRUCTIONS_SHEET);
  sheet.columns = [{ width: 118 }];

  const title = sheet.addRow(["Planilha mensal do BudgetOS"]);
  title.font = { bold: true, size: 16, color: { argb: TITLE_COLOR } };
  title.height = 24;

  const lines = [
    `Esta planilha é de um mês só: ${monthName(competence.month)} de ${competence.year}, como está na aba Mês.`,
    "",
    "O caminho:",
    "1. Confira a competência na aba Mês. É ela que manda — mudando ali, a planilha inteira passa a ser de outro mês.",
    "2. Corrija os valores do cadastro nas abas Gastos fixos, Assinaturas, Compras parceladas, Cartões, Entradas fixas e Categorias. Elas já vêm preenchidas com o que o app tem hoje.",
    "3. Lance os gastos e as receitas do mês na aba Lançamentos — é a aba que você mais preenche.",
    "4. Em Configurações, no app, use Importar planilha. O app mostra tudo o que vai mudar antes de gravar.",
    "",
    "As duas regras que importam:",
    "CADASTRO (contas fixas, assinaturas, cartões, categorias, entradas fixas, compras parceladas) é casado pelo NOME. O que está na planilha é atualizado, o que não está é criado, e o que existe no app mas não aparece na planilha fica como está. Importar nunca apaga cadastro.",
    "MOVIMENTO (lançamentos, aportes, ajustes, contas marcadas como pagas) é substituído por mês. Reimportar o mesmo mês apaga só as linhas que a importação anterior criou e grava as novas — nada duplica. O que você lançou à mão dentro do app continua lá.",
    "",
    "Pode preencher à vontade:",
    "A ordem das colunas não importa, e o cabeçalho é reconhecido mesmo sem acento ou com outro nome parecido.",
    "Valor aceita 1234,56 / 1.234,56 / R$ 1.234,56 e número puro. Gasto em negativo também é lido como gasto — o sinal vem da coluna Tipo.",
    "Data aceita 15/11/2026 e só o dia (15). Linha em branco é ignorada, não é erro.",
    "Aba que você apagar é simplesmente não importada: dá para subir uma planilha só com a aba Mês e a aba Lançamentos.",
    "",
    "Se algo estiver errado, o app diz a aba e o número da linha antes de gravar — e não grava nada até você confirmar.",
    "",
  ];

  for (const line of lines) {
    const row = sheet.addRow([line]);
    row.font = {
      size: 10,
      bold: line.endsWith(":") || line.startsWith("CADASTRO") || line.startsWith("MOVIMENTO"),
    };
    row.alignment = { wrapText: true, vertical: "top" };
    if (line.length > 150) row.height = 42;
    else if (line.length > 80) row.height = 28;
  }

  const sectionTitle = sheet.addRow(["Coluna por coluna"]);
  sectionTitle.font = { bold: true, size: 14, color: { argb: TITLE_COLOR } };
  sectionTitle.height = 22;
  sheet.addRow([]);

  for (const spec of SHEETS) writeInstructionsFor(sheet, spec);
}

/**
 * Monta a planilha.
 *
 * `prefill` falso gera o mesmo arquivo sem as linhas de cadastro — serve para
 * quem quer começar de zero, mas o caminho normal é com o cadastro dentro.
 */
export async function buildMonthlyTemplate(
  prefill = true
): Promise<TemplateResult> {
  const competence = templateCompetence();
  const registry = prefill
    ? readRegistry(competence)
    : ({
        categories: [],
        cards: [],
        incomes: [],
        fixed: [],
        subscriptions: [],
        purchases: [],
        month: { startingBalance: null, salary: null, extraIncome: null },
      } satisfies Registry);

  const book = new ExcelJS.Workbook();
  book.creator = "BudgetOS";
  book.created = new Date();

  // A ordem das abas é a ordem de criação, e é a ordem de preenchimento.
  writeInstructions(book, competence);

  const rowsFor: Record<string, Record<string, unknown>[]> = {
    month: [
      {
        competence: `${pad(competence.month)}/${competence.year}`,
        startingBalance: registry.month.startingBalance,
        salary: registry.month.salary,
        extraIncome: registry.month.extraIncome,
      },
    ],
    transactions: [],
    fixed: registry.fixed.map((item) => ({
      name: item.name,
      amount: item.amount,
      dueDay: item.due,
      paid: item.paid ? "sim" : "não",
      active: item.active ? "sim" : "não",
    })),
    subscriptions: registry.subscriptions.map((item) => ({
      name: item.name,
      amount: item.amount,
      billingDay: item.day,
      method: item.method,
      card: item.card,
      category: item.category,
      active: item.active ? "sim" : "não",
    })),
    purchases: registry.purchases.map((item) => ({
      description: item.description,
      card: item.card,
      totalAmount: item.total,
      installmentsCount: item.count,
      currentInstallment: item.current,
      category: item.category,
      purchaseDate: item.date,
    })),
    cards: registry.cards.map((item) => ({
      name: item.name,
      closingDay: item.closing,
      dueDay: item.due,
      creditLimit: item.limit || null,
    })),
    incomes: registry.incomes.map((item) => ({
      name: item.name,
      amount: item.amount,
      active: item.active ? "sim" : "não",
    })),
    categories: registry.categories.map((item) => ({
      name: item.name,
      emoji: item.emoji,
      limit: item.limit || null,
    })),
    investments: [],
    adjustments: [],
  };

  for (const spec of SHEETS) {
    const sheet = book.addWorksheet(spec.name);
    writeHeader(sheet, spec);
    for (const row of rowsFor[spec.id] ?? []) sheet.addRow(row);
    formatBody(sheet, spec);
  }

  const buffer = Buffer.from(await book.xlsx.writeBuffer());
  const filename = `budgetos-${competence.year}-${pad(competence.month)}${
    prefill ? "" : "-em-branco"
  }.xlsx`;
  return { buffer, filename };
}
