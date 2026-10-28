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

## Próximos meses (previsão por planilha)

A tela **Próximos meses** desenha os gastos futuros a partir de uma planilha,
sem passar por nenhuma tela de lançamento. É só visualização: nada ali entra
no saldo, no disponível, nas reservas ou nas faturas.

O caminho é sempre o mesmo:

1. **Baixar o modelo** (botão *Importar planilha*). O *modelo já preenchido*
   traz os próximos 12 meses com contas fixas, assinaturas, parcelas e
   entradas que o app conhece — é conferir e completar.
2. **Preencher** a aba `Lançamentos`: uma linha por gasto, com competência,
   grupo, descrição e valor. A aba *Como preencher* explica cada coluna.
3. **Importar**. O app lê o arquivo, mostra o que vai mudar (linhas,
   competências, quanto seria substituído, erros linha a linha) e só grava
   depois da confirmação.

A gravação é **por competência**: os meses presentes no arquivo são trocados
pelos dele, os outros ficam intactos. Dá para preencher um mês por vez e
reimportar o mesmo mês corrigido quantas vezes quiser, sem duplicar.

O padrão da planilha vive num arquivo só, `lib/forecast/schema.ts` — o modelo
gerado e o leitor saem dos dois lados dele. A leitura é tolerante: ordem de
coluna livre, nomes alternativos de cabeçalho, cabeçalho abaixo de um título,
`11/2026` ou `nov/26` ou `Ano`+`Mês`, `R$ 1.234,56` ou `1234.56`, valor
negativo lido como positivo e linha em branco ignorada.

## Exportar e fazer backup

Configurações → **Baixar planilha (.xlsx)**: uma aba por assunto (meses,
entradas e contas fixas, assinaturas, cartões, compras parceladas, parcelas,
faturas, lançamentos, ajustes, aportes, orçamentos). É só leitura — não
reimporta. A exceção é a aba **Próximos meses**, que sai no formato do modelo
e pode ser editada e reimportada naquela tela.

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
  forecast/     "Próximos meses" — gráficos da previsão vinda de planilha.
  settings/     Configurações.
  transactions/ Lançamentos (reservado).
hooks/          Hooks globais de dados (TanStack Query) e mutações compartilhadas.
lib/            Infraestrutura: banco local, navegação, cn().
  db/           Schema SQLite e conexão. Roda só no servidor.
  export/       Monta o .xlsx de exportação (ExcelJS). Só no servidor.
  forecast/     Próximos meses: schema.ts é O PADRÃO da planilha (colunas e
                leitura tolerante), template.ts gera o modelo, parse.ts lê o
                arquivo e apply.ts grava por competência. Só no servidor.
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
