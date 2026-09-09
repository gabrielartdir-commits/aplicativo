import {
  createTransaction,
  findTransactionById,
  listTransactionsByMonth,
  removeTransaction,
  removeTransactionsByMonth,
  updateTransaction,
  variableSpendByMonth,
} from "@/services/actions/ledger.actions";

export type { TransactionFilters } from "@/services/actions/ledger.actions";

/** Fachada sobre as Server Actions (ver vault-repository). */
export const transactionRepository = {
  listByMonth: listTransactionsByMonth,
  variableSpendByMonth,
  create: createTransaction,
  findById: findTransactionById,
  update: updateTransaction,
  remove: removeTransaction,
  removeByMonth: removeTransactionsByMonth,
};
