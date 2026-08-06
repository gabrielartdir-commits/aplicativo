/**
 * Sanidade das regras financeiras (funções puras de lib/finance).
 * Rodar com: npx tsx scripts/verify-finance.ts
 */
import {
  applyAdjustment,
  applyExpense,
  applyFixedExpensePayment,
  applyIncome,
  applyInvestment,
  applyInvoicePayment,
  applyInvoicesTotalChange,
  computeMonthOpening,
  installmentCompetences,
  splitInstallments,
} from "../lib/finance/calculations";
import {
  competenceForPurchase,
  invoiceDueDate,
  isBeforeCompetence,
} from "../lib/dates";

let failures = 0;

function expectEqual(label: string, actual: number, expected: number) {
  const ok = Math.abs(actual - expected) < 1e-9;
  console.log(`${ok ? "✔" : "✘"} ${label}: ${actual} ${ok ? "" : `(esperado ${expected})`}`);
  if (!ok) failures++;
}

// Abertura do mês: 500 restantes + 5000 salário + 200 extras,
// 1800 de gastos fixos e meta de 1500 de investimento.
// Sob o modelo de reserva, o investimento de meta é subtraído na abertura.
const opening = computeMonthOpening({
  startingBalance: 500,
  salary: 5000,
  extraIncome: 200,
  fixedExpensesTotal: 1800,
  investmentGoal: 1500,
});
expectEqual("abertura: saldo bancário", opening.bank_balance, 5700);
expectEqual("abertura: disponível", opening.available_balance, 2400); // 5700 - 1800 - 1500 = 2400

// Gasto de 52 (iFood): sai do banco e do disponível; reservas intactas.
const afterExpense = applyExpense(opening, 52);
expectEqual("gasto: saldo bancário", afterExpense.bank_balance, 5648);
expectEqual("gasto: disponível", afterExpense.available_balance, 2348);
expectEqual(
  "gasto: reserva fixos intacta",
  afterExpense.reserved_fixed_expenses,
  1800
);

// Receita de 300 (freela): banco e disponível sobem.
const afterIncome = applyIncome(afterExpense, 300);
expectEqual("receita: saldo bancário", afterIncome.bank_balance, 5948);
expectEqual("receita: disponível", afterIncome.available_balance, 2648);

// Pagar gasto fixo de 120: banco e reserva caem juntos; disponível NÃO muda.
const afterPaid = applyFixedExpensePayment(afterIncome, 120, true);
expectEqual("fixo pago: saldo bancário", afterPaid.bank_balance, 5828);
expectEqual("fixo pago: reserva fixos", afterPaid.reserved_fixed_expenses, 1680);
expectEqual("fixo pago: disponível inalterado", afterPaid.available_balance, 2648);

// Desmarcar o pagamento devolve tudo.
const afterUnpaid = applyFixedExpensePayment(afterPaid, 120, false);
expectEqual("fixo desfeito: saldo bancário", afterUnpaid.bank_balance, 5948);
expectEqual("fixo desfeito: disponível", afterUnpaid.available_balance, 2648);

// Ajustes de saldo: só banco + disponível.
expectEqual(
  "ajuste entrada +300",
  applyAdjustment(afterUnpaid, "entry", 300).bank_balance,
  6248
);
expectEqual(
  "ajuste saída 100",
  applyAdjustment(afterUnpaid, "exit", 100).bank_balance,
  5848
);
expectEqual(
  "ajuste correção -50",
  applyAdjustment(afterUnpaid, "correction", -50).bank_balance,
  5898
);
expectEqual(
  "ajuste transferência 200",
  applyAdjustment(afterUnpaid, "transfer", 200).bank_balance,
  5748
);
expectEqual(
  "ajuste entrada muda disponível",
  applyAdjustment(afterUnpaid, "entry", 300).available_balance,
  2948
);

// Aporte efetivado de 1500 (dentro da meta reservada): banco NÃO cai, reserva se mantém, disponível NÃO muda.
const afterInvest = applyInvestment(afterUnpaid, 1500);
expectEqual("aporte: saldo bancário", afterInvest.bank_balance, 5948);
expectEqual("aporte: reserva investimento", afterInvest.reserved_investment, 1500);
expectEqual("aporte: disponível inalterado", afterInvest.available_balance, 2648);

// Aporte excedente de 2000 (meta era 1500): banco NÃO cai, reserva vira 2000, disponível cai por 500.
const afterExcess = applyInvestment(afterUnpaid, 2000);
expectEqual("excesso: saldo bancário", afterExcess.bank_balance, 5948);
expectEqual("excesso: reserva investimento", afterExcess.reserved_investment, 2000);
expectEqual("excesso: disponível cai", afterExcess.available_balance, 2148);

// Arredondamento: 0.1 + 0.2 não pode virar 0.30000000000000004.
const rounding = applyExpense(
  {
    bank_balance: 0.3,
    reserved_fixed_expenses: 0,
    reserved_investment: 0,
    reserved_invoices: 0,
    available_balance: 0.3,
  },
  0.1
);
expectEqual("arredondamento", rounding.bank_balance, 0.2);

// ---------------------------------------------------------------------------
// CRÉDITO — faturas, parcelas e assinaturas
// ---------------------------------------------------------------------------

// Fatura conhecida de 800 reserva do disponível assim que entra.
const withInvoice = applyInvoicesTotalChange(afterUnpaid, 800);
expectEqual("fatura: saldo bancário intacto", withInvoice.bank_balance, 5948);
expectEqual("fatura: reserva de faturas", withInvoice.reserved_invoices, 800);
expectEqual("fatura: disponível cai 800", withInvoice.available_balance, 1848);

// Pagar a fatura: sai do banco E da reserva — disponível não muda.
const invoicePaid = applyInvoicePayment(withInvoice, 800, true);
expectEqual("fatura paga: saldo bancário", invoicePaid.bank_balance, 5148);
expectEqual("fatura paga: reserva zera", invoicePaid.reserved_invoices, 0);
expectEqual("fatura paga: disponível inalterado", invoicePaid.available_balance, 1848);

// Desfazer o pagamento devolve os dois lados.
const invoiceUndone = applyInvoicePayment(invoicePaid, 800, false);
expectEqual("fatura desfeita: saldo bancário", invoiceUndone.bank_balance, 5948);
expectEqual("fatura desfeita: reserva volta", invoiceUndone.reserved_invoices, 800);
expectEqual("fatura desfeita: disponível", invoiceUndone.available_balance, 1848);

// Divisão de parcelas: a soma das partes tem que bater com o total exato.
const split3 = splitInstallments(100, 3);
expectEqual("parcela 1 de 100/3", split3[0], 33.33);
expectEqual("parcela 3 de 100/3 (resíduo)", split3[2], 33.34);
expectEqual(
  "soma das parcelas = total",
  split3.reduce((a, b) => a + b, 0),
  100
);

const split7 = splitInstallments(1000, 7);
expectEqual(
  "1000 em 7x soma exata",
  Math.round(split7.reduce((a, b) => a + b, 0) * 100) / 100,
  1000
);

// Competências: 5 parcelas a partir de nov/2026 terminam em mar/2027.
const comps = installmentCompetences(2026, 11, 5);
expectEqual("1ª parcela: mês", comps[0].month, 11);
expectEqual("1ª parcela: ano", comps[0].year, 2026);
expectEqual("última parcela: mês", comps[4].month, 3);
expectEqual("última parcela: ano", comps[4].year, 2027);

// ---------------------------------------------------------------------------
// COMPRA JÁ EM ANDAMENTO — só as parcelas restantes entram
// ---------------------------------------------------------------------------

// 1200 em 12x, atualmente na parcela 5: restam 8 de 100, somando 800.
// O valor da parcela vem do total ORIGINAL — não é 800/8 nem 1200/8.
const todas = splitInstallments(1200, 12);
const restantes = todas.slice(5 - 1);
expectEqual("parcela continua 100 (não 150)", restantes[0], 100);
expectEqual("restam 8 parcelas", restantes.length, 8);
expectEqual(
  "saldo devedor = 800",
  restantes.reduce((a, b) => a + b, 0),
  800
);
expectEqual(
  "as 4 anteriores somam 400",
  todas.slice(0, 4).reduce((a, b) => a + b, 0),
  400
);

// Compra em andamento com resíduo: 100 em 3x na parcela 2 restam 33,33 + 33,34.
const resid = splitInstallments(100, 3).slice(2 - 1);
expectEqual("resíduo preservado na última", resid[1], 33.34);
expectEqual(
  "restante de 100/3 na parcela 2",
  Math.round(resid.reduce((a, b) => a + b, 0) * 100) / 100,
  66.67
);

// Última parcela: resta exatamente uma.
const ultima = splitInstallments(1200, 12).slice(12 - 1);
expectEqual("na última parcela resta 1", ultima.length, 1);

// ---------------------------------------------------------------------------
// FECHAMENTO DO CARTÃO — em qual fatura a compra cai
// ---------------------------------------------------------------------------

// Cartão fecha dia 28. Compra no dia 5 entra na fatura do próprio mês.
const antes = competenceForPurchase("2026-08-05", 28);
expectEqual("compra antes do fechamento: mês", antes.month, 8);
expectEqual("compra antes do fechamento: ano", antes.year, 2026);

// Compra no dia 29 já pegou a fatura fechada: cai na seguinte.
const depois = competenceForPurchase("2026-08-29", 28);
expectEqual("compra após o fechamento: mês", depois.month, 9);
expectEqual("compra após o fechamento: ano", depois.year, 2026);

// No próprio dia do fechamento ainda entra na fatura do mês.
const noDia = competenceForPurchase("2026-08-28", 28);
expectEqual("compra no dia do fechamento: mês", noDia.month, 8);

// Virada de ano: compra em 30/dez com fechamento dia 28 vai para jan do ano seguinte.
const virada = competenceForPurchase("2026-12-30", 28);
expectEqual("virada de ano: mês", virada.month, 1);
expectEqual("virada de ano: ano", virada.year, 2027);

// ---------------------------------------------------------------------------
// VENCIMENTO DA FATURA — sempre depois do fechamento
// ---------------------------------------------------------------------------

// Fecha 28, vence 10: a fatura de agosto é paga em 10 de SETEMBRO.
expectEqual(
  "vence no mês seguinte (fecha 28, vence 10)",
  Number(invoiceDueDate({ year: 2026, month: 8 }, 28, 10).slice(5, 7)),
  9
);

// Fecha 5, vence 15: os dois caem no mesmo mês.
expectEqual(
  "vence no mesmo mês (fecha 5, vence 15)",
  Number(invoiceDueDate({ year: 2026, month: 8 }, 5, 15).slice(5, 7)),
  8
);

// Dia 31 num mês de 30 cai no último dia, nunca vaza para o mês seguinte.
expectEqual(
  "vencimento dia 31 em abril vira 30",
  Number(invoiceDueDate({ year: 2026, month: 4 }, 1, 31).slice(8, 10)),
  30
);

// ---------------------------------------------------------------------------
// ASSINATURA NÃO RETROAGE
// ---------------------------------------------------------------------------

const inicio = { year: 2026, month: 8 };
expectEqual(
  "assinatura de ago não vale em jul",
  isBeforeCompetence({ year: 2026, month: 7 }, inicio) ? 1 : 0,
  1
);
expectEqual(
  "assinatura de ago vale em ago",
  isBeforeCompetence(inicio, inicio) ? 1 : 0,
  0
);
expectEqual(
  "assinatura de ago vale em set",
  isBeforeCompetence({ year: 2026, month: 9 }, inicio) ? 1 : 0,
  0
);

if (failures > 0) {
  console.error(`\n${failures} verificação(ões) falharam.`);
  process.exit(1);
}
console.log("\nTodas as regras financeiras verificadas.");
