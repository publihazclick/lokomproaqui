-- Para que "Movimiento fletes" (billetera dropshipper) pueda mostrar una etiqueta legible por
-- movimiento (recarga, flete de pedido, flete devuelto, flete+seguro, flete devuelto por seguro)
-- en vez de adivinar por el monto. Parametro nuevo opcional, no rompe ningun call-site existente.
alter table wallet_ledger add column kind text;

create or replace function credit_wallet(p_profile_id uuid, p_wallet_type wallet_type, p_amount numeric, p_order_id bigint, p_pct numeric, p_kind text default null)
returns void as $$
declare
  v_prev numeric;
  v_new numeric;
begin
  insert into wallet_balances (profile_id, wallet_type, balance)
  values (p_profile_id, p_wallet_type, 0)
  on conflict (profile_id, wallet_type) do nothing;

  select balance into v_prev from wallet_balances where profile_id = p_profile_id and wallet_type = p_wallet_type for update;
  v_new := v_prev + p_amount;

  update wallet_balances set balance = v_new where profile_id = p_profile_id and wallet_type = p_wallet_type;

  insert into wallet_ledger (profile_id, wallet_type, order_id, amount, previous_balance, new_balance, pct, direction, status, kind)
  values (p_profile_id, p_wallet_type, p_order_id, p_amount, v_prev, v_new, p_pct, 0, 1, p_kind);
end;
$$ language plpgsql;

create or replace function debit_wallet(p_profile_id uuid, p_wallet_type wallet_type, p_amount numeric, p_order_id bigint, p_kind text default null)
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

  insert into wallet_ledger (profile_id, wallet_type, order_id, amount, previous_balance, new_balance, pct, direction, status, kind)
  values (p_profile_id, p_wallet_type, p_order_id, -p_amount, v_prev, v_new, null, 1, 1, p_kind);
end;
$$ language plpgsql;

-- Recargas de billetera dropshipper (webhook ePayco) ya usan credit_wallet: se etiquetan como
-- 'recarga' desde ahora (ver supabase/functions/epayco-webhook/index.ts).
