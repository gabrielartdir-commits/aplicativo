import {
  createCategory,
  listCategories,
  removeCategory,
  updateCategory,
} from "@/services/actions/core.actions";

/** Fachada sobre as Server Actions (ver vault-repository). */
export const categoryRepository = {
  list: listCategories,
  create: createCategory,
  update: updateCategory,
  remove: removeCategory,
};
