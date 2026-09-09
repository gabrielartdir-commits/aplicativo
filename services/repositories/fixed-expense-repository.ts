import {
  createFixedExpense,
  listActiveFixedExpenses,
  listFixedExpenses,
  removeFixedExpense,
  updateFixedExpense,
} from "@/services/actions/fixed.actions";

/** Fachada sobre as Server Actions (ver vault-repository). */
export const fixedExpenseRepository = {
  list: listFixedExpenses,
  listActive: listActiveFixedExpenses,
  create: createFixedExpense,
  update: updateFixedExpense,
  remove: removeFixedExpense,
};
