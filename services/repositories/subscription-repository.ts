import {
  createSubscription,
  listActiveSubscriptions,
  listActiveSubscriptionsByCardForCompetence,
  listSubscriptions,
  removeSubscription,
  updateSubscription,
} from "@/services/actions/cards.actions";

/** Fachada sobre as Server Actions (ver vault-repository). */
export const subscriptionRepository = {
  list: listSubscriptions,
  listActive: listActiveSubscriptions,
  listActiveByCardForCompetence: listActiveSubscriptionsByCardForCompetence,
  create: createSubscription,
  update: updateSubscription,
  remove: removeSubscription,
};
