import {
  appendAiConversation,
  listRecentAiConversations,
} from "@/services/actions/ledger.actions";

/** Fachada sobre as Server Actions (ver vault-repository). */
export const aiConversationRepository = {
  append: appendAiConversation,
  listRecent: listRecentAiConversations,
};
