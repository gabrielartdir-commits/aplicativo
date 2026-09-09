import {
  createVault,
  findVault,
  updateVaultInvestmentGoal,
} from "@/services/actions/core.actions";

/**
 * Fachada sobre as Server Actions.
 *
 * O acesso a dados passou a rodar no servidor — SQLite não existe no
 * navegador. Manter o objeto com os mesmos nomes de método evita tocar em
 * todos os serviços e hooks que já o consomem.
 */
export const vaultRepository = {
  find: findVault,
  create: createVault,
  updateInvestmentGoal: updateVaultInvestmentGoal,
};
