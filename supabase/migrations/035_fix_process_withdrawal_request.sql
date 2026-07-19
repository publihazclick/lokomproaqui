-- Bug real encontrado en la auditoria final antes de produccion (2026-07-15): al aprobar un retiro
-- de la billetera de referidos, process_withdrawal_request (migracion 009) hacia
-- `update wallet_balances set balance = 0` en vez de restar el monto solicitado. Esto significa que
-- si al vendedor le entraron NUEVAS comisiones entre el momento en que pidio el retiro y el momento
-- en que un admin lo aprobo, esa plata nueva se borraba tambien (nunca deberia haber salido de su
-- saldo). Tampoco tenia guarda contra doble-aprobacion (a diferencia de process_supplier_payout,
-- migracion 034, que ya se hizo bien). Se corrige para restar solo el monto real via debit_wallet
-- (mismo mecanismo ya usado por supplier payouts), preservando el resto de la logica (net_amount).

create or replace function process_withdrawal_request(p_request_id bigint, p_action text)
returns void as $$
declare
  v_profile_id uuid;
  v_amount numeric;
  v_status int;
begin
  select profile_id, amount, status into v_profile_id, v_amount, v_status
  from withdrawal_requests where id = p_request_id;

  if v_profile_id is null then
    raise exception 'retiro_no_encontrado';
  end if;

  if v_status = 1 or v_status = 2 then
    raise exception 'retiro_ya_procesado';
  end if;

  if p_action = 'approve' then
    perform debit_wallet(v_profile_id, 'referral', v_amount, null, 'retiro_referidos');

    update withdrawal_requests
    set status = 1, processed_at = now(),
        net_amount = v_amount - coalesce(freight_deduction, 0) - coalesce(returns_deduction, 0)
    where id = p_request_id;
  elsif p_action = 'reject' then
    update withdrawal_requests set status = 2, processed_at = now() where id = p_request_id;
  end if;
end;
$$ language plpgsql;
