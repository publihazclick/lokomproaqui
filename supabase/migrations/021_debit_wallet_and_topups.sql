-- Debito con guarda de saldo insuficiente (credit_wallet no tiene esta guarda y no debe
-- reusarse con monto negativo para gastos de billetera).
create or replace function debit_wallet(p_profile_id uuid, p_wallet_type wallet_type, p_amount numeric, p_order_id bigint)
returns void as $$
declare
  v_prev numeric;
  v_new numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'monto_invalido';
  end if;

  insert into wallet_balances (profile_id, wallet_type, balance)
  values (p_profile_id, p_wallet_type, 0)
  on conflict (profile_id, wallet_type) do nothing;

  select balance into v_prev from wallet_balances
    where profile_id = p_profile_id and wallet_type = p_wallet_type for update;
  v_new := v_prev - p_amount;

  if v_new < 0 then
    raise exception 'saldo_insuficiente';
  end if;

  update wallet_balances set balance = v_new where profile_id = p_profile_id and wallet_type = p_wallet_type;

  insert into wallet_ledger (profile_id, wallet_type, order_id, amount, previous_balance, new_balance, pct, direction, status)
  values (p_profile_id, p_wallet_type, p_order_id, -p_amount, v_prev, v_new, null, 1, 1);
end;
$$ language plpgsql;

-- Recargas de la billetera 'dropshipper' via ePayco (mismo patron que recharge_purchases,
-- pero con `code` UNIQUE para que el webhook siempre resuelva exactamente una fila).
create table wallet_topups (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles(id),
  amount numeric not null,
  code text not null unique,
  status int not null default 0, -- 0 pendiente, 1 rechazado, 2 pagado/acreditado
  epayco_transaction_id text,
  created_at timestamptz not null default now()
);

alter table wallet_topups enable row level security;
create policy "wallet_topups_all" on wallet_topups for all using (true) with check (true);
