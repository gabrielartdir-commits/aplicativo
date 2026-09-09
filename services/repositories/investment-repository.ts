import {
  createInvestment,
  listAllInvestments,
  listInvestmentsByMonth,
  removeInvestmentByMonthAmountDescription,
  removeInvestmentsByMonth,
} from "@/services/actions/ledger.actions";

/** Fachada sobre as Server Actions (ver vault-repository). */
export const investmentRepository = {
  listByMonth: listInvestmentsByMonth,
  listAll: listAllInvestments,
  create: createInvestment,
  removeByMonthAndAmountAndDescription:
    removeInvestmentByMonthAmountDescription,
  removeByMonth: removeInvestmentsByMonth,
};
