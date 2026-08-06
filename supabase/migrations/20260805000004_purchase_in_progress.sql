-- BudgetOS — cadastrar compra parcelada já em andamento
--
-- Ao migrar para o app, boa parte das compras já está no meio do
-- parcelamento. O usuário informa em qual parcela está, e só as restantes
-- são materializadas — as anteriores já saíram de faturas que o app nunca viu.
--
-- O valor de cada parcela continua sendo calculado sobre o total ORIGINAL da
-- compra, não sobre o saldo devedor: 1200 em 12x na parcela 5 gera 8 parcelas
-- de 100, e não 8 de 150.
--
-- first_installment_no guarda a primeira parcela materializada, para a tela
-- saber quantas já haviam sido pagas antes do cadastro.

alter table public.card_purchases
  add column first_installment_no smallint not null default 1
    check (first_installment_no >= 1);

alter table public.card_purchases
  add constraint first_installment_within_count
    check (first_installment_no <= installments_count);
