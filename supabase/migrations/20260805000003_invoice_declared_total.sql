-- BudgetOS — valor final da fatura informado manualmente
--
-- Nem toda compra no cartão passa pelo app. Para essas, o usuário informa o
-- total real da fatura, lido do extrato.
--
-- O valor informado SUBSTITUI a soma calculada, não se acumula com ela:
-- parcelas e assinaturas já estão dentro do total do extrato, então somar as
-- duas coisas contaria o mesmo gasto duas vezes. A diferença entre o total
-- informado e o que o app conhece é o que chamamos de "outras compras".
--
--   total = declared_total, quando informado
--         = parcelas + assinaturas, caso contrário

alter table public.card_invoices
  add column declared_total numeric(12, 2)
    check (declared_total is null or declared_total >= 0);

-- A coluna gerada precisa ser recriada para incluir o novo termo.
alter table public.card_invoices drop column total;

alter table public.card_invoices
  add column total numeric(12, 2)
  generated always as (
    coalesce(declared_total, installments_total + subscriptions_total)
  ) stored;
