-- BudgetOS — cartões de crédito, parcelas e assinaturas
--
-- Introduz o eixo de CRÉDITO no modelo, que até aqui era só débito.
-- A regra central:
--
--   Fatura do mês = Σ parcelas que caem no mês + Σ assinaturas no crédito
--
-- A fatura em aberto é reservada do saldo bancário, como um gasto fixo.
-- Assinaturas no crédito NÃO viram reserva própria — já estão dentro da
-- fatura, e contá-las de novo seria dobrar o mesmo compromisso.
-- Assinaturas no débito não entram em fatura nenhuma e reservam sozinhas.

-- ---------------------------------------------------------------------------
-- credit_cards — cartões do usuário
-- closing_day: dia do fechamento da fatura; due_day: dia do vencimento.
-- ---------------------------------------------------------------------------
create table public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  closing_day smallint not null check (closing_day between 1 and 31),
  due_day smallint not null check (due_day between 1 and 31),
  credit_limit numeric(12, 2) not null default 0 check (credit_limit >= 0),
  color text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- card_purchases — uma compra no cartão, à vista ou parcelada.
-- installments_count = 1 representa a compra à vista.
-- first_charge_year/month: competência da primeira parcela.
-- ---------------------------------------------------------------------------
create table public.card_purchases (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.credit_cards (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  description text not null,
  total_amount numeric(12, 2) not null check (total_amount > 0),
  installments_count smallint not null default 1
    check (installments_count between 1 and 120),
  purchase_date date not null default current_date,
  first_charge_year smallint not null check (first_charge_year between 2000 and 2200),
  first_charge_month smallint not null check (first_charge_month between 1 and 12),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- card_installments — uma linha por parcela, materializada na criação da
-- compra. Guardar cada parcela (em vez de derivar na leitura) permite ajustar
-- uma parcela isolada e montar o calendário sem recalcular nada.
-- O resíduo do arredondamento vai na última parcela.
-- ---------------------------------------------------------------------------
create table public.card_installments (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.card_purchases (id) on delete cascade,
  installment_no smallint not null check (installment_no >= 1),
  year smallint not null check (year between 2000 and 2200),
  month smallint not null check (month between 1 and 12),
  amount numeric(12, 2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (purchase_id, installment_no)
);

-- ---------------------------------------------------------------------------
-- subscriptions — cobranças recorrentes mensais.
-- payment_method define o destino: crédito entra na fatura do cartão,
-- débito reserva direto do saldo, como um gasto fixo.
-- ---------------------------------------------------------------------------
create type public.payment_method as enum ('credit', 'debit');

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  billing_day smallint not null check (billing_day between 1 and 31),
  payment_method public.payment_method not null default 'credit',
  card_id uuid references public.credit_cards (id) on delete set null,
  category_id uuid references public.categories (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint subscription_credit_requires_card check (
    payment_method <> 'credit' or card_id is not null
  )
);

-- ---------------------------------------------------------------------------
-- card_invoices — fatura de um cartão numa competência.
-- Os totais são mantidos pela camada de serviços a partir das parcelas e
-- assinaturas; total é derivado para nunca divergir das partes.
-- ---------------------------------------------------------------------------
create table public.card_invoices (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.credit_cards (id) on delete cascade,
  year smallint not null check (year between 2000 and 2200),
  month smallint not null check (month between 1 and 12),
  installments_total numeric(12, 2) not null default 0 check (installments_total >= 0),
  subscriptions_total numeric(12, 2) not null default 0 check (subscriptions_total >= 0),
  total numeric(12, 2) generated always as (installments_total + subscriptions_total) stored,
  due_date date not null,
  paid boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (card_id, year, month)
);

-- ---------------------------------------------------------------------------
-- months.reserved_invoices — faturas em aberto reservadas do saldo.
-- available_balance passa a ser
--   bank_balance - reserved_fixed_expenses - reserved_investment - reserved_invoices
-- ---------------------------------------------------------------------------
alter table public.months
  add column reserved_invoices numeric(12, 2) not null default 0;

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------
create index idx_card_purchases_card on public.card_purchases (card_id);
create index idx_card_installments_purchase on public.card_installments (purchase_id);
create index idx_card_installments_competence on public.card_installments (year, month);
create index idx_subscriptions_card on public.subscriptions (card_id);
create index idx_card_invoices_card on public.card_invoices (card_id);
create index idx_card_invoices_competence on public.card_invoices (year, month);

-- ---------------------------------------------------------------------------
-- RLS — mesma política aberta das demais tabelas (ver core_schema).
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'credit_cards', 'card_purchases', 'card_installments',
    'subscriptions', 'card_invoices'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "single_user_full_access" on public.%I for all to anon, authenticated using (true) with check (true)',
      t
    );
  end loop;
end;
$$;
