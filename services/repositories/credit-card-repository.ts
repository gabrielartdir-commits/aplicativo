import {
  createCreditCard,
  listActiveCreditCards,
  listCreditCards,
  removeCreditCard,
  updateCreditCard,
} from "@/services/actions/cards.actions";

/** Fachada sobre as Server Actions (ver vault-repository). */
export const creditCardRepository = {
  list: listCreditCards,
  listActive: listActiveCreditCards,
  create: createCreditCard,
  update: updateCreditCard,
  remove: removeCreditCard,
};
