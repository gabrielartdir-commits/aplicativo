import {
  createInstallments,
  listInstallmentsByCardAndCompetence,
  listInstallmentsByCompetence,
  listUpcomingInstallments,
  removeInstallmentsByPurchase,
} from "@/services/actions/cards.actions";

/** Fachada sobre as Server Actions (ver vault-repository). */
export const cardInstallmentRepository = {
  listByCompetence: listInstallmentsByCompetence,
  listByCardAndCompetence: listInstallmentsByCardAndCompetence,
  listUpcoming: listUpcomingInstallments,
  createMany: createInstallments,
  removeByPurchase: removeInstallmentsByPurchase,
};
