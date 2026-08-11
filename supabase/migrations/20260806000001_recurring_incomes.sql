-- BudgetOS — entradas fixas mensais
--
-- Até aqui o mês tinha um único campo `salary`, um número solto. Agora as
-- entradas recorrentes viram registros nomeados e editáveis, e `months.salary`
-- passa a ser a soma das ativas.
--
-- A diferença prática: dá para ver de onde vem cada real que entra, e ajustar
-- uma fonte sem mexer nas outras.

create table public.recurring_incomes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric(12, 2) not null default 0 check (amount >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_recurring_incomes_sort on public.recurring_incomes (sort_order);

alter table public.recurring_incomes enable row level security;
create policy "single_user_full_access" on public.recurring_incomes
  for all to anon, authenticated using (true) with check (true);

-- As duas entradas fixas da casa. A primeira herda o salário já registrado no
-- mês aberto, para nenhum valor se perder na migração.
insert into public.recurring_incomes (name, amount, sort_order)
values
  (
    'Salário Gabriel',
    coalesce(
      (select salary from public.months where closed = false
       order by year desc, month desc limit 1),
      0
    ),
    0
  ),
  ('Salário Tarynne', 0, 1);
