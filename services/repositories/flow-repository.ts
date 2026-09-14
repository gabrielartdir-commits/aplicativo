import { getAnnualFlow } from "@/services/actions/flow.actions";

/** Fachada sobre as Server Actions (ver vault-repository). */
export const flowRepository = {
  annual: getAnnualFlow,
};
