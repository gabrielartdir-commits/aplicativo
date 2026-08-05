# BudgetOS

Copiloto financeiro pessoal baseado em orçamento. A pergunta que o produto responde:

> **"Quanto eu realmente posso gastar?"**

Não é um app financeiro tradicional — é um assistente de decisão diária.

## Stack

- **Next.js 15** (App Router) + React 19 + TypeScript
- **TailwindCSS 4** + **shadcn/ui** (tokens em CSS variables, tema escuro)
- **Framer Motion** — animações discretas
- **Supabase** (`@supabase/ssr`) — dados e auth
- **TanStack Query** — estado de servidor
- **React Hook Form + Zod** — formulários e validação
- **Recharts** — visualizações
- **Lucide** — ícones

## Rodando

```sh
npm install
cp .env.example .env.local   # preencher com as chaves do Supabase
npm run dev
```

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
  auth/         Autenticação (reservado).
  transactions/ Lançamentos (reservado).
hooks/          Hooks globais de dados (TanStack Query) e mutações compartilhadas.
lib/            Infraestrutura: clientes Supabase, navegação, cn(), crypto da chave.
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
  repositories/ Acesso cru ao Supabase, uma tabela por arquivo.
types/          Database (espelho do schema) + tipos de domínio.
utils/          Funções puras (formatação de moeda/data pt-BR).
supabase/       Migrations SQL (rodar no SQL Editor ou via CLI).
scripts/        verify-finance.ts — sanidade das regras (npx tsx scripts/verify-finance.ts).
```

## Conceito central

```
Saldo bancário − Gastos fixos reservados − Meta de investimento = Dinheiro Disponível
```

- Categorias **não reservam dinheiro** — são apenas limites de controle.
- Pagar um gasto fixo reduz banco **e** reserva juntos → disponível não muda.
- Ajustes de saldo alteram apenas o saldo bancário; o disponível é recalculado.
- Um registro por mês em `months`; orçamentos do mês em `monthly_category_budgets`
  (cópia dos limites de `categories`, que nunca é alterada pelo fluxo mensal).

## Primeiro acesso

Sem login por email: um único `vault` protegido por chave de acesso (só o hash
SHA-256 é salvo). Sem vault → onboarding em 4 etapas (cofre + chave, meta de
investimento, gastos fixos, categorias). Com vault → tela de desbloqueio.
Sem mês aberto → modal de abertura (saldo anterior, salário, extras).

### Convenções

- Uma feature nunca importa de outra feature — código compartilhado sobe para `components/shared`, `hooks/` ou `utils/`.
- Pages em `app/` não contêm lógica: importam a view de `features/<nome>` via barrel (`index.ts`).
- Componentes de servidor por padrão; `"use client"` apenas onde há interatividade.
- Tokens de design centralizados em `app/globals.css` — nada de cores hardcoded.
- Tipos do banco vêm de codegen (`supabase/README.md`), nunca escritos à mão.
