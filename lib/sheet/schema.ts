/**
 * O PADRÃO da planilha mensal do BudgetOS.
 *
 * Este arquivo é a única fonte da verdade do formato. O modelo que o app
 * oferece para baixar (`./template.ts`) e o leitor do arquivo preenchido
 * (`./read.ts`) saem os dois daqui — mexer numa coluna aqui muda os dois
 * lados de uma vez, e nunca acontece de o modelo ter uma coluna que o leitor
 * não conhece.
 *
 * Cada aba corresponde a uma tabela do app. A regra de atualização de cada
 * uma está no campo `rule` e aparece tanto na aba "Como preencher" quanto na
 * tela de importação, porque é a parte que importa entender:
 *
 *   * CADASTRO (contas fixas, assinaturas, cartões, categorias, entradas
 *     fixas, compras parceladas) é casado por NOME. O que está na planilha é
 *     atualizado, o que não está é criado, e o que existe no app mas não
 *     aparece na planilha fica como está — importar nunca apaga cadastro.
 *   * MOVIMENTO do mês (lançamentos, aportes, ajustes, contas pagas) é
 *     SUBSTITUÍDO por competência: ao reimportar o mesmo mês, só as linhas
 *     que a importação anterior criou saem. O que foi digitado no app fica.
 *
 * O leitor é tolerante de propósito: a ordem das colunas não importa, o
 * cabeçalho é reconhecido pelo nome sem acento nem maiúscula, cada coluna
 * aceita vários nomes, valor aceita R$ 1.234,56 e 1234.56, data aceita
 * 15/11/2026 e só o dia, e linha em branco é ignorada.
 */

export const INSTRUCTIONS_SHEET = "Como preencher";

export type SheetId =
  | "month"
  | "transactions"
  | "fixed"
  | "subscriptions"
  | "purchases"
  | "cards"
  | "incomes"
  | "categories"
  | "investments"
  | "adjustments";

export interface SheetColumn {
  id: string;
  /** Cabeçalho escrito no modelo. */
  header: string;
  /** Outros nomes aceitos na leitura (já normalizados: sem acento, minúsculo). */
  aliases: string[];
  width: number;
  money?: boolean;
  /** Lista fechada, que vira validação de célula no Excel. */
  list?: string[];
  /** Aparece na aba de instruções. */
  help: string;
}

export interface SheetSpec {
  id: SheetId;
  /** Nome da aba no arquivo. */
  name: string;
  /** Outros nomes de aba aceitos na leitura. */
  aliases: string[];
  /** Uma linha explicando para que serve. */
  purpose: string;
  /** A regra de atualização, em português claro. */
  rule: string;
  /** Quantas linhas em branco o modelo já traz formatadas. */
  rows: number;
  columns: SheetColumn[];
}

const ATIVO: string[] = ["sim", "não"];

export const SHEETS: SheetSpec[] = [
  {
    id: "month",
    name: "Mês",
    aliases: ["mes", "competencia", "abertura"],
    purpose: "Diz de qual mês é a planilha inteira.",
    rule: "O mês é criado se ainda não existir no app. Já existindo, os valores preenchidos aqui substituem os dele — deixe em branco o que não quer mexer.",
    rows: 2,
    columns: [
      {
        id: "competence",
        header: "Competência",
        aliases: ["competencia", "mes/ano", "mes ano", "periodo", "referencia"],
        width: 16,
        help: "Obrigatório, e é a única coluna obrigatória da planilha toda: todas as outras abas pertencem a este mês. Escreva 11/2026, nov/26 ou novembro 2026.",
      },
      {
        id: "startingBalance",
        header: "Saldo inicial",
        aliases: [
          "saldo inicial",
          "saldo anterior",
          "saldo de abertura",
          "saldo",
        ],
        width: 16,
        money: true,
        help: "Quanto havia na conta no primeiro dia do mês. Em branco, o app mantém o que já tem (ou usa o saldo final do mês anterior, se o mês for novo).",
      },
      {
        id: "salary",
        header: "Salário",
        aliases: ["salario", "entradas fixas", "renda", "receita fixa"],
        width: 16,
        money: true,
        help: "Total das entradas fixas do mês. Em branco, o app soma as entradas fixas cadastradas.",
      },
      {
        id: "extraIncome",
        header: "Receitas extras",
        aliases: ["receitas extras", "extras", "extra", "renda extra"],
        width: 16,
        money: true,
        help: "Entradas eventuais já conhecidas na abertura. Freelas que caírem no meio do mês podem ir na aba Lançamentos como receita.",
      },
    ],
  },
  {
    id: "transactions",
    name: "Lançamentos",
    aliases: ["lancamentos", "gastos", "despesas", "movimentacao", "extrato"],
    purpose:
      "Os gastos e as receitas do dia a dia — a aba que você mais preenche.",
    rule: "Substitui os lançamentos que a importação anterior deste mês criou. O que você lançou à mão dentro do app continua lá.",
    rows: 300,
    columns: [
      {
        id: "date",
        header: "Data",
        aliases: ["data", "dia", "quando"],
        width: 12,
        help: "15/11/2026, ou só o dia (15) — o mês e o ano saem da competência. Em branco, entra no primeiro dia do mês.",
      },
      {
        id: "description",
        header: "Descrição",
        aliases: [
          "descricao",
          "item",
          "nome",
          "gasto",
          "lancamento",
          "historico",
        ],
        width: 38,
        help: "Obrigatório. O que foi.",
      },
      {
        id: "category",
        header: "Categoria",
        aliases: ["categoria", "grupo", "classificacao"],
        width: 20,
        help: "O nome da categoria, igual ao do app. Categoria que não existir é criada na importação, com limite zero. Receita não usa categoria.",
      },
      {
        id: "kind",
        header: "Tipo",
        aliases: ["tipo", "natureza", "entrada/saida"],
        width: 12,
        list: ["gasto", "receita"],
        help: "Em branco vale como gasto. Use receita para dinheiro entrando no meio do mês (freela, reembolso, venda).",
      },
      {
        id: "amount",
        header: "Valor",
        aliases: ["valor", "total", "r$", "quantia"],
        width: 14,
        money: true,
        help: "Obrigatório, positivo. O sinal vem do Tipo, não do valor — gasto em negativo também é lido como gasto.",
      },
    ],
  },
  {
    id: "fixed",
    name: "Gastos fixos",
    aliases: ["gastos fixos", "contas fixas", "fixos", "contas"],
    purpose: "As contas que se repetem todo mês, com o valor deste mês.",
    rule: "Casado por nome: o valor e o vencimento daqui atualizam a conta no app. Conta nova é criada. Conta que existe no app e não aparece aqui fica intacta.",
    rows: 60,
    columns: [
      {
        id: "name",
        header: "Conta",
        aliases: ["conta", "nome", "descricao", "gasto fixo", "item"],
        width: 30,
        help: "Obrigatório. Use o mesmo nome todo mês — é por ele que o app reconhece a conta e atualiza em vez de duplicar.",
      },
      {
        id: "amount",
        header: "Valor",
        aliases: ["valor", "valor do mes", "total", "r$"],
        width: 14,
        money: true,
        help: "Obrigatório. O valor DESTE mês. É aqui que se corrige a conta de luz que subiu.",
      },
      {
        id: "dueDay",
        header: "Vence dia",
        aliases: [
          "vence dia",
          "vencimento",
          "dia",
          "dia do vencimento",
          "dia de vencimento",
        ],
        width: 12,
        help: "Dia do mês, de 1 a 31. Em branco, mantém o que já está cadastrado.",
      },
      {
        id: "paid",
        header: "Pago",
        aliases: ["pago", "quitado", "status", "situacao"],
        width: 10,
        list: ["não", "sim"],
        help: "Marque sim para as contas que você já pagou neste mês. O app baixa o pagamento: sai do saldo e sai da reserva, então o disponível não muda. Em branco é não.",
      },
      {
        id: "active",
        header: "Ativo",
        aliases: ["ativo", "ativa", "em uso", "vigente"],
        width: 10,
        list: ATIVO,
        help: "Em branco é sim. Ponha não para uma conta que você encerrou: ela deixa de ser reservada e de entrar na projeção, sem perder o histórico.",
      },
    ],
  },
  {
    id: "subscriptions",
    name: "Assinaturas",
    aliases: ["assinaturas", "recorrencias", "servicos"],
    purpose: "Serviços que cobram todo mês, no cartão ou no débito.",
    rule: "Casado por nome, como os gastos fixos. Assinatura que não aparece na planilha fica como está no app.",
    rows: 60,
    columns: [
      {
        id: "name",
        header: "Assinatura",
        aliases: ["assinatura", "nome", "servico", "descricao"],
        width: 28,
        help: "Obrigatório. Mesmo nome todo mês.",
      },
      {
        id: "amount",
        header: "Valor",
        aliases: ["valor", "mensalidade", "total", "r$"],
        width: 14,
        money: true,
        help: "Obrigatório. Valor da cobrança mensal.",
      },
      {
        id: "billingDay",
        header: "Cobra dia",
        aliases: [
          "cobra dia",
          "dia da cobranca",
          "dia",
          "vencimento",
          "cobranca",
        ],
        width: 12,
        help: "Dia do mês em que a cobrança cai. Em branco, mantém o cadastrado (ou dia 1, se for nova).",
      },
      {
        id: "method",
        header: "Forma",
        aliases: ["forma", "forma de pagamento", "pagamento", "meio"],
        width: 12,
        list: ["crédito", "débito"],
        help: "Em branco é crédito. No crédito, a assinatura entra na fatura do cartão; no débito, sai direto da conta.",
      },
      {
        id: "card",
        header: "Cartão",
        aliases: ["cartao", "cartao de credito", "banco"],
        width: 18,
        help: "Obrigatório quando a forma é crédito: o nome do cartão, igual ao da aba Cartões. No débito, deixe em branco.",
      },
      {
        id: "category",
        header: "Categoria",
        aliases: ["categoria", "grupo"],
        width: 18,
        help: "Opcional, para a assinatura entrar numa categoria.",
      },
      {
        id: "active",
        header: "Ativo",
        aliases: ["ativo", "ativa", "em uso"],
        width: 10,
        list: ATIVO,
        help: "Em branco é sim. Ponha não ao cancelar o serviço — ele sai da fatura e da projeção daqui para frente.",
      },
    ],
  },
  {
    id: "purchases",
    name: "Compras parceladas",
    aliases: ["compras parceladas", "parcelamentos", "compras", "parcelas"],
    purpose: "Compras no cartão que ainda têm parcelas por vir.",
    rule: "Casada por descrição + cartão. O app refaz as parcelas desta compra a partir da parcela atual — por isso a coluna Parcela atual é a que mantém tudo no lugar mês a mês.",
    rows: 60,
    columns: [
      {
        id: "description",
        header: "Descrição",
        aliases: ["descricao", "compra", "item", "nome"],
        width: 32,
        help: "Obrigatório. Mesma descrição todo mês, para o app saber que é a mesma compra.",
      },
      {
        id: "card",
        header: "Cartão",
        aliases: ["cartao", "banco"],
        width: 18,
        help: "Obrigatório. Nome do cartão, igual ao da aba Cartões.",
      },
      {
        id: "totalAmount",
        header: "Valor total",
        aliases: ["valor total", "total", "valor da compra", "valor"],
        width: 15,
        money: true,
        help: "Obrigatório. O total ORIGINAL da compra, não o da parcela. O app divide pelo número de parcelas e o centavo que sobra vai na última.",
      },
      {
        id: "installmentsCount",
        header: "Parcelas",
        aliases: [
          "parcelas",
          "n de parcelas",
          "numero de parcelas",
          "qtd parcelas",
          "total de parcelas",
        ],
        width: 12,
        help: "Obrigatório. Em quantas vezes a compra foi feita.",
      },
      {
        id: "currentInstallment",
        header: "Parcela atual",
        aliases: ["parcela atual", "parcela", "parcela do mes", "atual"],
        width: 14,
        help: "Qual parcela cai NESTE mês. Uma compra em 10x que está na 4ª: escreva 4. Em branco vale 1 (compra nova).",
      },
      {
        id: "category",
        header: "Categoria",
        aliases: ["categoria", "grupo"],
        width: 18,
        help: "Opcional.",
      },
      {
        id: "purchaseDate",
        header: "Data da compra",
        aliases: ["data da compra", "data", "comprado em"],
        width: 15,
        help: "Opcional, só para registro. Em branco, entra o primeiro dia do mês da competência.",
      },
    ],
  },
  {
    id: "cards",
    name: "Cartões",
    aliases: ["cartoes", "cartoes de credito"],
    purpose:
      "Os cartões de crédito, para as assinaturas e as parcelas terem onde cair.",
    rule: "Casado por nome. Cartão que já existe tem fechamento, vencimento e limite atualizados.",
    rows: 12,
    columns: [
      {
        id: "name",
        header: "Cartão",
        aliases: ["cartao", "nome", "banco"],
        width: 22,
        help: "Obrigatório. Use o mesmo nome nas abas Assinaturas e Compras parceladas.",
      },
      {
        id: "closingDay",
        header: "Fecha dia",
        aliases: ["fecha dia", "fechamento", "dia do fechamento", "fecha"],
        width: 12,
        help: "Dia em que a fatura fecha. Compra depois do fechamento cai na fatura seguinte — é o que faz o app acertar a competência das parcelas.",
      },
      {
        id: "dueDay",
        header: "Vence dia",
        aliases: ["vence dia", "vencimento", "dia do vencimento"],
        width: 12,
        help: "Dia em que a fatura vence.",
      },
      {
        id: "creditLimit",
        header: "Limite",
        aliases: ["limite", "limite total", "limite de credito"],
        width: 14,
        money: true,
        help: "Opcional, só para acompanhar o quanto do limite está comprometido.",
      },
    ],
  },
  {
    id: "incomes",
    name: "Entradas fixas",
    aliases: ["entradas fixas", "entradas", "receitas fixas", "rendas"],
    purpose: "Salário e outras entradas que se repetem todo mês.",
    rule: "Casado por nome. É a soma destas entradas que o app usa como salário ao abrir um mês novo.",
    rows: 12,
    columns: [
      {
        id: "name",
        header: "Entrada",
        aliases: ["entrada", "nome", "descricao", "fonte"],
        width: 28,
        help: "Obrigatório. Salário, pró-labore, aluguel recebido.",
      },
      {
        id: "amount",
        header: "Valor",
        aliases: ["valor", "total", "r$"],
        width: 14,
        money: true,
        help: "Obrigatório. Valor líquido mensal.",
      },
      {
        id: "active",
        header: "Ativo",
        aliases: ["ativo", "ativa"],
        width: 10,
        list: ATIVO,
        help: "Em branco é sim.",
      },
    ],
  },
  {
    id: "categories",
    name: "Categorias",
    aliases: ["categorias", "grupos"],
    purpose: "As categorias dos gastos e o limite mensal de cada uma.",
    rule: "Casada por nome. Categoria citada na aba Lançamentos que não existir aqui nem no app é criada com limite zero.",
    rows: 40,
    columns: [
      {
        id: "name",
        header: "Categoria",
        aliases: ["categoria", "nome", "grupo"],
        width: 24,
        help: "Obrigatório.",
      },
      {
        id: "emoji",
        header: "Emoji",
        aliases: ["emoji", "icone"],
        width: 8,
        help: "Opcional, só visual.",
      },
      {
        id: "limit",
        header: "Limite mensal",
        aliases: ["limite mensal", "limite", "teto", "orcamento"],
        width: 15,
        money: true,
        help: "Quanto você pretende gastar no mês nessa categoria. Limite é controle, não reserva: não sai do disponível.",
      },
    ],
  },
  {
    id: "investments",
    name: "Aportes",
    aliases: ["aportes", "investimentos", "investimento"],
    purpose: "O que você investiu no mês.",
    rule: "Substitui os aportes que a importação anterior deste mês criou.",
    rows: 20,
    columns: [
      {
        id: "amount",
        header: "Valor",
        aliases: ["valor", "total", "r$"],
        width: 14,
        money: true,
        help: "Obrigatório, positivo.",
      },
      {
        id: "description",
        header: "Descrição",
        aliases: ["descricao", "onde", "destino", "nome"],
        width: 32,
        help: "Opcional: Tesouro Direto, CDB, reserva.",
      },
    ],
  },
  {
    id: "adjustments",
    name: "Ajustes de saldo",
    aliases: ["ajustes de saldo", "ajustes", "ajuste"],
    purpose: "Correções no saldo da conta que não são gasto nem receita.",
    rule: "Substitui os ajustes que a importação anterior deste mês criou.",
    rows: 20,
    columns: [
      {
        id: "type",
        header: "Tipo",
        aliases: ["tipo", "natureza"],
        width: 16,
        list: ["correção", "entrada", "saída", "transferência"],
        help: "Em branco é correção. Correção aceita valor negativo; entrada soma, saída e transferência subtraem.",
      },
      {
        id: "amount",
        header: "Valor",
        aliases: ["valor", "total", "r$"],
        width: 14,
        money: true,
        help: "Obrigatório.",
      },
      {
        id: "description",
        header: "Descrição",
        aliases: ["descricao", "motivo", "nome"],
        width: 34,
        help: "Por que o saldo mudou. Vale escrever — ajuste sem motivo é o que faz o saldo deixar de fazer sentido depois.",
      },
    ],
  },
];

export function sheetSpec(id: SheetId): SheetSpec {
  const found = SHEETS.find((sheet) => sheet.id === id);
  if (!found) throw new Error(`Aba desconhecida no padrão: ${id}`);
  return found;
}
