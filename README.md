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

Uma única variável, opcional, em `.env.local`: `AI_API_KEY` para o copiloto.
Sem ela, todo o resto funciona.

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
  settings/     Configurações.
  transactions/ Lançamentos (reservado).
hooks/          Hooks globais de dados (TanStack Query) e mutações compartilhadas.
lib/            Infraestrutura: banco local, navegação, cn().
  db/           Schema SQLite e conexão. Roda só no servidor.
  ai.ts         Cliente de IA para provedores compatíveis com a API da OpenAI
                (OpenAI, Groq, OpenRouter…). Trocar de provedor é só mexer em
                AI_BASE_URL, AI_API_KEY e AI_MODEL — ver COMO_INSTALAR.md.
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
