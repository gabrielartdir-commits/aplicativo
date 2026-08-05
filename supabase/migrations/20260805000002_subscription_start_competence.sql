-- BudgetOS — assinaturas não retroagem sobre faturas passadas
--
-- Assinatura é recorrente, então recalcular a fatura de um mês anterior
-- passava a incluí-la ali também — reescrevendo histórico. Duas travas:
--
--   1. start_year/start_month: a assinatura só entra em faturas a partir
--      da competência em que passou a ser cobrada.
--   2. Fatura paga não é recalculada (regra na camada de serviços).

alter table public.subscriptions
  add column start_year smallint not null
    default extract(year from current_date)
    check (start_year between 2000 and 2200),
  add column start_month smallint not null
    default extract(month from current_date)
    check (start_month between 1 and 12);

create index idx_subscriptions_start
  on public.subscriptions (start_year, start_month);
