import {
  createCardPurchase,
  listPurchasesWithInstallments,
  removeCardPurchase,
  updateCardPurchase,
} from "@/services/actions/cards.actions";

/** Fachada sobre as Server Actions (ver vault-repository). */
export const cardPurchaseRepository = {
  listWithInstallments: listPurchasesWithInstallments,
  create: createCardPurchase,
  update: updateCardPurchase,
  remove: removeCardPurchase,
};
