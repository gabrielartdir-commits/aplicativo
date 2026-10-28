import "server-only";

/**
 * O modelo .xlsx que o app oferece para preencher os próximos meses.
 *
 * Três abas:
 *
 *   * "Lançamentos" — a única que a importação lê. Vem com o cabeçalho do
 *     padrão, largura de coluna, formato de moeda no Valor e listas prontas
 *     em Tipo e Status. É a primeira aba de propósito: se um dia alguém
 *     renomear a aba, o leitor cai na primeira e continua funcionando.
 *   * "Como preencher" — o que cada coluna aceita e como a importação se
 *     comporta, para não depender de lembrar.
 *   * "Exemplo" — linhas de exemplo numa aba que a importação ignora, para
 *     servirem de referência sem virarem dado de verdade por esquecimento.
 *
 * Com `prefill`, a aba de lançamentos já vem preenchida com o que o app
 * conhece dos próximos meses (entradas fixas, contas fixas, assinaturas e as
 * parcelas de cartão de cada competência) — é só conferir, corrigir e
 * completar, em vez de digitar tudo de novo. Isso só lê as tabelas do app;
 * nada é alterado.
 */

import ExcelJS from "exceljs";
import { all } from "@/lib/db";
import { round2 } from "@/lib/finance";
import {
  COLUMNS,
  EXAMPLE_SHEET,
  INSTRUCTIONS_SHEET,
  SHEET_NAME,
  TEMPLATE_COLUMNS,
  TEMPLATE_ROWS,
  competenceKey,
} from "./schema";

const MONEY = "R$ #,##0.00";
const HORIZON = 12;

interface TemplateRow {
  Competência: string;
  Tipo: string;
  Grupo: string;
  Descrição: string;
  Valor: number | null;
  Status: string;
  Forma: string;
  Observação: string;
}

function row(partial: Partial<TemplateRow>): TemplateRow {
  return {
    Competência: "",
    Tipo: "",
    Grupo: "",
    Descrição: "",
    Valor: null,
    Status: "",
    Forma: "",
    Observação: "",
    ...partial,
  };
}

function nextCompetences(count: number): { year: number; month: number }[] {
  // Começa no mês aberto no app quando existe; senão, no mês do computador.
  const open = all<{ year: number; month: number }>(
    "SELECT year, month FROM months ORDER BY year DESC, month DESC LIMIT 1"
  )[0];
  const now = new Date();
  let year = open?.year ?? now.getFullYear();
  let month = open?.month ?? now.getMonth() + 1;

  const list: { year: number; month: number }[] = [];
  for (let i = 0; i < count; i++) {
    list.push({ year, month });
    month = month === 12 ? 1 : month + 1;
    if (month === 1) year += 1;
  }
  return list;
}

/** Linhas sugeridas a partir do que o app já sabe dos próximos meses. */
function prefillRows(): TemplateRow[] {
  const competences = nextCompetences(HORIZON);

  const incomes = all<{ name: string; amount: number }>(
    "SELECT name, amount FROM recurring_incomes WHERE active = 1 ORDER BY sort_order, name"
  );
  const fixed = all<{ name: string; amount: number; due_day: number }>(
    "SELECT name, amount, due_day FROM fixed_expenses WHERE active = 1 ORDER BY due_day, name"
  );
  const subscriptions = all<{
    name: string;
    amount: number;
    payment_method: string;
    card: string | null;
  }>(
    `SELECT s.name, s.amount, s.payment_method, c.name AS card
       FROM subscriptions s
       LEFT JOIN credit_cards c ON c.id = s.card_id
      WHERE s.active = 1
      ORDER BY s.name`
  );
  const installments = all<{
    year: number;
    month: number;
    amount: number;
    installment_no: number;
    installments_count: number;
    description: string;
    card: string;
  }>(
    `SELECT i.year, i.month, i.amount, i.installment_no,
            p.installments_count, p.description, c.name AS card
       FROM card_installments i
       JOIN card_purchases p ON p.id = i.purchase_id
       JOIN credit_cards c ON c.id = p.card_id
      ORDER BY i.year, i.month, p.description`
  );

  const rows: TemplateRow[] = [];

  for (const competence of competences) {
    const label = competenceKey(competence.year, competence.month);

    for (const income of incomes) {
      rows.push(
        row({
          Competência: label,
          Tipo: "entrada",
          Grupo: "Entradas",
          Descrição: income.name,
          Valor: round2(Number(income.amount)),
          Status: "previsto",
        })
      );
    }

    for (const expense of fixed) {
      rows.push(
        row({
          Competência: label,
          Tipo: "saída",
          Grupo: "Contas fixas",
          Descrição: expense.name,
          Valor: round2(Number(expense.amount)),
          Status: "previsto",
          Observação: `vence dia ${expense.due_day}`,
        })
      );
    }

    for (const subscription of subscriptions) {
      rows.push(
        row({
          Competência: label,
          Tipo: "saída",
          Grupo: "Assinaturas",
          Descrição: subscription.name,
          Valor: round2(Number(subscription.amount)),
          Status: "previsto",
          Forma:
            subscription.payment_method === "credit"
              ? `cartão ${subscription.card ?? ""}`.trim()
              : "débito",
        })
      );
    }

    for (const installment of installments) {
      if (
        installment.year !== competence.year ||
        installment.month !== competence.month
      ) {
        continue;
      }
      rows.push(
        row({
          Competência: label,
          Tipo: "saída",
          Grupo: "Parcelas",
          Descrição: `${installment.description} (${installment.installment_no}/${installment.installments_count})`,
          Valor: round2(Number(installment.amount)),
          Status: "previsto",
          Forma: `cartão ${installment.card}`,
        })
      );
    }
  }

  return rows;
}

const EXAMPLES: TemplateRow[] = [
  row({
    Competência: "11/2026",
    Tipo: "entrada",
    Grupo: "Entradas",
    Descrição: "Salário",
    Valor: 11000,
    Status: "confirmado",
  }),
  row({
    Competência: "11/2026",
    Tipo: "saída",
    Grupo: "Moradia",
    Descrição: "Aluguel",
    Valor: 2400,
    Status: "confirmado",
    Forma: "débito",
  }),
  row({
    Competência: "11/2026",
    Grupo: "Moradia",
    Descrição: "Luz",
    Valor: 180.5,
    Observação: "média dos últimos meses",
  }),
  row({
    Competência: "11/2026",
    Grupo: "Cartão",
    Descrição: "Fatura Nubank",
    Valor: 3200,
    Forma: "cartão Nubank",
  }),
  row({
    Competência: "12/2026",
    Grupo: "Moradia",
    Descrição: "Aluguel",
    Valor: 2400,
    Status: "previsto",
    Forma: "débito",
  }),
  row({
    Competência: "12/2026",
    Grupo: "Presentes",
    Descrição: "Natal",
    Valor: 900,
    Observação: "estimativa",
  }),
];

/** Escreve o cabeçalho, as larguras, o formato de moeda e as listas. */
function buildEntriesSheet(book: ExcelJS.Workbook, rows: TemplateRow[]): void {
  const sheet = book.addWorksheet(SHEET_NAME, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = TEMPLATE_COLUMNS.map((column) => ({
    header: column.header,
    key: column.header,
    width: column.width,
  }));

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.alignment = { vertical: "middle" };
  header.height = 22;
  header.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F766E" },
    };
  });

  rows.forEach((item) => sheet.addRow(item));

  // Listas e formato valem para bem mais linhas do que as preenchidas: o
  // arquivo é para continuar sendo digitado depois de baixado.
  const lastRow = Math.max(rows.length + 1, TEMPLATE_ROWS);

  TEMPLATE_COLUMNS.forEach((column, index) => {
    const col = sheet.getColumn(index + 1);
    if (column.money) {
      col.numFmt = MONEY;
      col.alignment = { horizontal: "right" };
    }
    if (!column.list) return;
    for (let r = 2; r <= lastRow; r++) {
      sheet.getCell(r, index + 1).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`"${column.list.join(",")}"`],
        showErrorMessage: true,
        errorTitle: column.header,
        error: `Use: ${column.list.join(", ")}`,
      };
    }
  });

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: TEMPLATE_COLUMNS.length },
  };
}

function buildInstructionsSheet(book: ExcelJS.Workbook, prefilled: boolean): void {
  const sheet = book.addWorksheet(INSTRUCTIONS_SHEET, {
    views: [{ showGridLines: false }],
  });
  sheet.columns = [{ width: 18 }, { width: 14 }, { width: 96 }];

  const title = sheet.addRow(["Próximos meses — como preencher"]);
  title.font = { bold: true, size: 15 };
  sheet.addRow([]);

  const intro = [
    "Uma linha por gasto previsto. O app soma as linhas por mês e desenha os gráficos da tela Próximos meses.",
    prefilled
      ? "Esta cópia já vem preenchida com o que o app conhece dos próximos 12 meses (entradas fixas, contas fixas, assinaturas e parcelas de cartão). Confira, corrija o que mudou e acrescente o resto."
      : "Preencha a aba Lançamentos. A aba Exemplo é só referência: a importação não lê ela.",
    "Ao importar, os meses que aparecem no arquivo são substituídos pelo conteúdo dele, e os meses que o arquivo não menciona ficam como estavam. Dá para reimportar o mesmo mês corrigido quantas vezes quiser, sem duplicar.",
    "Antes de gravar, o app mostra o que vai mudar e lista linha por linha qualquer problema encontrado. Se houver erro, nada é gravado.",
    "Importar aqui não altera saldo, disponível, reservas nem faturas: este espaço é só de visualização.",
  ];
  for (const text of intro) {
    const line = sheet.addRow(["", "", text]);
    line.getCell(3).alignment = { wrapText: true, vertical: "top" };
    line.height = 30;
  }

  sheet.addRow([]);
  const head = sheet.addRow(["Coluna", "Obrigatória", "O que aceita"]);
  head.font = { bold: true };

  for (const column of COLUMNS) {
    const required = column.id === "name" || column.id === "amount";
    const competence = column.id === "competence";
    const line = sheet.addRow([
      column.header,
      required ? "sim" : competence ? "sim*" : "não",
      column.help,
    ]);
    line.getCell(1).font = { bold: true };
    line.getCell(3).alignment = { wrapText: true, vertical: "top" };
    line.height = 30;
  }

  sheet.addRow([]);
  const note = sheet.addRow([
    "",
    "",
    "* A competência é obrigatória, mas pode vir na coluna Competência (11/2026) ou nas colunas Ano e Mês. A ordem das colunas não importa e o app reconhece variações do nome do cabeçalho.",
  ]);
  note.getCell(3).alignment = { wrapText: true, vertical: "top" };
  note.height = 30;
}

function buildExampleSheet(book: ExcelJS.Workbook): void {
  const sheet = book.addWorksheet(EXAMPLE_SHEET, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = TEMPLATE_COLUMNS.map((column) => ({
    header: column.header,
    key: column.header,
    width: column.width,
  }));
  sheet.getRow(1).font = { bold: true };
  EXAMPLES.forEach((item) => sheet.addRow(item));

  TEMPLATE_COLUMNS.forEach((column, index) => {
    if (!column.money) return;
    const col = sheet.getColumn(index + 1);
    col.numFmt = MONEY;
    col.alignment = { horizontal: "right" };
  });
}

export async function buildTemplate(
  prefill = false
): Promise<{ buffer: Buffer; filename: string }> {
  const book = new ExcelJS.Workbook();
  book.creator = "BudgetOS";
  book.created = new Date();

  const rows = prefill ? prefillRows() : [];

  // A ordem de criação é a ordem das abas no Excel; Lançamentos vem primeiro.
  buildEntriesSheet(book, rows);
  buildInstructionsSheet(book, prefill);
  buildExampleSheet(book);

  const buffer = Buffer.from(await book.xlsx.writeBuffer());
  const stamp = new Date().toISOString().slice(0, 10);
  const suffix = prefill ? "preenchido" : "modelo";

  return { buffer, filename: `proximos-meses-${suffix}-${stamp}.xlsx` };
}
