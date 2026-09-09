import {
  createBudgets,
  findBudgetByMonthAndCategory,
  listBudgetsByMonth,
  resetBudgetSpentByMonth,
  updateBudgetCurrentLimit,
  updateBudgetLimits,
  updateBudgetSpent,
} from "@/services/actions/core.actions";

/** Fachada sobre as Server Actions (ver vault-repository). */
export const budgetRepository = {
  listByMonth: listBudgetsByMonth,
  findByMonthAndCategory: findBudgetByMonthAndCategory,
  createMany: createBudgets,
  updateSpent: updateBudgetSpent,
  updateCurrentLimit: updateBudgetCurrentLimit,
  resetSpentByMonth: resetBudgetSpentByMonth,
  updateLimits: updateBudgetLimits,
};
