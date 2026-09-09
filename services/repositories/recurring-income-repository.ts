import {
  createRecurringIncome,
  findRecurringIncomeById,
  listRecurringIncomes,
  recurringIncomeActiveTotal,
  removeRecurringIncome,
  updateRecurringIncome,
} from "@/services/actions/fixed.actions";

/** Fachada sobre as Server Actions (ver vault-repository). */
export const recurringIncomeRepository = {
  list: listRecurringIncomes,
  findById: findRecurringIncomeById,
  activeTotal: recurringIncomeActiveTotal,
  create: createRecurringIncome,
  update: updateRecurringIncome,
  remove: removeRecurringIncome,
};
