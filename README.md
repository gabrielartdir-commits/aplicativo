# BudgetOS

Copiloto financeiro pessoal baseado em orçamento. A pergunta que o produto responde:

> **"Quanto eu realmente posso gastar?"**

Não é um app financeiro tradicional — é um assistente de decisão diária.

## Stack

- **Next.js 15** (App Router) + React 19 + TypeScript
- **TailwindCSS 4** + **shadcn/ui** (tokens em CSS variables, tema escuro)
- **Framer Motion** — animações discretas
- **SQLite** via `node:sqlite` — banco local, sem dependência nativa
- **TanStack Query** — estado de servidor
- **React Hook Form + Zod** — formulários e validação
- **Recharts** — visualizações
- **Lucide** — ícones

## Rodando

Duplo clique em `BudgetOS.bat`: compila na primeira vez, sobe o servidor em
`localhost:3000` e abre o navegador. Fechar a janela desliga.

Pelo terminal:

```sh
npm install
npm run dev                  # desenvolvimento
npm run build && npm start   # produção local
```

Uma única variável, opcional, em `.env.local`: `ANTHROPIC_API_KEY` para o
copiloto, a análise por voz e a consultoria. Sem ela, todo o resto funciona.

Atalho na area de trabalho e no menu Iniciar:

```
powershell -ExecutionPolicy Bypass -File scripts\criar-atalho.ps1
```

Lembrete do 5º dia útil (opcional):

```
powershell -ExecutionPolicy Bypass -File scripts\instalar-lembrete.ps1
```

## Planilha do mês (entrada de dados)

O caminho principal para alimentar o app não é digitar lançamento por
lançamento: é preencher uma planilha por mês e subir de uma vez, em
**Configurações → Planilha do mês**.

1. **Baixar o modelo**. Ele já vem com o cadastro atual dentro — contas fixas,
   assinaturas, parcelas em andamento, cartões, categorias e entradas fixas —
   e com a competência preenchida. Preencher é corrigir valores, não digitar
   tudo de novo.
2. **Preencher** a aba `Lançamentos` com os gastos e as receitas do mês, e
   acertar o que mudou nas outras abas. A aba *Como preencher*, gerada junto,
   explica cada coluna.
3. **Importar**. O app lê, mostra o que vai mudar (linhas, mês, o que será
   substituído, erros com aba e número da linha) e só grava depois da
   confirmação.

Cada aba vai para a sua tabela, com duas regras distintas:

- **Cadastro** (contas fixas, assinaturas, cartões, categorias, entradas
  fixas, compras parceladas) é casado por **nome**: o que está na planilha é
  atualizado, o que não está é criado, e o que existe só no app fica como
  está. Importar nunca apaga cadastro — é assim que uma conta fixa que mudou
  de valor se corrige sem perder histórico.
- **Movimento do mês** (lançamentos, aportes, ajustes, contas pagas) é
  **substituído por competência**. O rastro em `sheet_import_rows` guarda qual
  importação criou qual linha, então reimportar o mesmo mês troca só as linhas
  da importação anterior: não duplica e não encosta no que foi lançado à mão
  dentro do app.

A gravação é uma transação só (ou entra o arquivo inteiro, ou nada); depois
dela, `cardService.refresh` refaz as faturas da competência e
`monthService.recalculate` reconstrói saldo, reservas e disponível a partir do
que ficou gravado.

O padrão vive num arquivo só, `lib/sheet/schema.ts` — o modelo gerado, a aba
de instruções e o leitor saem dos três lados dele. A leitura é tolerante:
ordem de coluna livre, nomes alternativos de aba e de cabeçalho, cabeçalho
abaixo de um título, `R$ 1.234,56` ou `1234.56`, data por extenso ou só o dia,
valor negativo lido pelo tipo e linha em branco ignorada.

## Próximos meses (projeção)

A tela **Próximos meses** não guarda nada: ela é calculada a cada visita, a
partir do cadastro que o app já tem. Cada um dos 12 meses seguintes soma
quatro partes:

```
contas fixas ativas
+ assinaturas ativas (a partir do mês em que começaram)
+ parcelas de cartão que caem naquela competência   ← a parte que diminui
+ média dos gastos variáveis dos meses já lançados
```

A fatura do cartão não entra como linha própria: ela é composta pelas parcelas
e pelas assinaturas no crédito, e somá-la contaria o mesmo compromisso duas
vezes. Meses sem nenhum gasto lançado ficam fora da média — zero ali quase
sempre quer dizer "não lancei", e errar a projeção para baixo é o erro que
machuca.

## Exportar e fazer backup

Configurações → **Baixar planilha (.xlsx)**: uma aba por assunto (meses,
entradas e contas fixas, assinaturas, cartões, compras parceladas, parcelas,
faturas, lançamentos, ajustes, aportes, orçamentos). É só leitura — quem
volta para dentro do app é a planilha do mês, no modelo acima.

Backup que restaura é copiar `data/budgetos.db` com o app fechado.

## Onde ficam os dados

`data/budgetos.db` — um arquivo SQLite nesta máquina. Backup é copiar o
arquivo; recomeçar do zero é apagá-lo. O schema vive em `lib/db/schema.sql` e
é aplicado sozinho quando o banco ainda não existe.

Nada sai do computador, exceto as mensagens que você enviar ao copiloto.

## Arquitetura

```
app/            Rotas (App Router). Pages são finas: apenas montam a view da feature.
  (app)/        Route group com o shell autenticado (sidebar + conteúdo).
components/
  ui/           Primitivos shadcn/ui.
  layout/       Shell da aplicação (sidebar, mobile nav, page header).
  providers/    Providers globais (TanStack Query, Tooltip).
  shared/       Componentes reutilizáveis entre features (empty state, etc.).
features/       Cada funcionalidade isolada: componentes, hooks e schemas próprios.
  home/         "Hoje" — orçamento disponível do dia.
  history/      Histórico de gastos.
  categories/   Categorias.
  fixed-expenses/  Gastos fixos recorrentes.
  investments/  Aportes.
  goals/        Objetivos.
  insights/     Padrões e recomendações.
  forecast/     "Próximos meses" — gráficos da projeção calculada.
  settings/     Configurações.
  transactions/ Lançamentos (reservado).
hooks/          Hooks globais de dados (TanStack Query) e mutações compartilhadas.
lib/            Infraestrutura: banco local, navegação, cn().
  db/           Schema SQLite e conexão. Roda só no servidor.
  export/       Monta o .xlsx de exportação (ExcelJS). Só no servidor.
  sheet/        Planilha do mês: schema.ts é O PADRÃO (abas, colunas e
                regra de atualização de cada uma), values.ts lê valor/data/
                sim-não, template.ts gera o modelo com o cadastro dentro,
                read.ts entende o arquivo e import.ts grava. Só no servidor.
  forecast/     project.ts monta a projeção dos 12 meses seguintes a partir
                do cadastro e da média dos variáveis. Só no servidor.
  ai.ts         Cliente do Claude (SDK da Anthropic). Duas camadas: "fast"
                (Haiku) interpreta a frase de cada lançamento; "deep" (Opus)
                analisa o orçamento. Chave em ANTHROPIC_API_KEY.
  finance/      REGRAS FINANCEIRAS — funções puras (disponível, reservas, ajustes).
  assistant/    IA real (Structured Outputs): prompt com contexto do mês,
                schema JSON, executor de ações (gasto, receita, pagar fixo, ajuste,
                perguntas). Roda só no servidor via app/api/assistant/route.ts.
services/       Orquestração com efeitos: monthService, transactionService,
                fixedExpenseService, balanceService; stubs budgetAllocator e
                simulationService preparados para o futuro.
  repositories/ Fachadas finas sobre as Server Actions, uma tabela por arquivo.
  actions/      Acesso ao SQLite. Roda só no servidor ("use server").
types/          Database (espelho do schema) + tipos de domínio.
utils/          Funções puras (formatação de moeda/data pt-BR).
scripts/        verify-finance.ts — sanidade das regras (npx tsx scripts/verify-finance.ts).
                criar-atalho.ps1 — atalho do BudgetOS (-Remover apaga).
                lembrete-mensal.ps1 — aviso no 5º dia útil (-Check mostra a data,
                -Force testa o aviso). instalar-lembrete.ps1 registra a tarefa.
```

## Conceito central

```
Saldo bancário − Gastos fixos reservados − Meta de investimento
                − Faturas de cartão em aberto = Dinheiro Disponível
```

- Categorias **não reservam dinheiro** — são apenas limites de controle.
- Pagar um gasto fixo reduz banco **e** reserva juntos → disponível não muda.
- Ajustes de saldo alteram apenas o saldo bancário; o disponível é recalculado.
- Um registro por mês em `months`; orçamentos do mês em `monthly_category_budgets`
  (cópia dos limites de `categories`, que nunca é alterada pelo fluxo mensal).

## Primeiro acesso

Sem login: o app roda em localhost e quem protege os dados é a conta do
Windows. Sem vault → onboarding em 4 etapas (nome do cofre, meta de
investimento, gastos fixos, categorias). Sem mês aberto → modal de abertura
(saldo anterior, salário, extras).

### Convenções

- Uma feature nunca importa de outra feature — código compartilhado sobe para `components/shared`, `hooks/` ou `utils/`.
- Pages em `app/` não contêm lógica: importam a view de `features/<nome>` via barrel (`index.ts`).
- Componentes de servidor por padrão; `"use client"` apenas onde há interatividade.
- Tokens de design centralizados em `app/globals.css` — nada de cores hardcoded.
- Tipos do banco em `types/database.ts` espelham `lib/db/schema.sql` à mão —
  o schema é pequeno e muda pouco.
