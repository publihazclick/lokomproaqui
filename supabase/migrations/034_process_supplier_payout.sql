-- Hito Fase 5 (Next.js): "Solicitar retiro" de proveedores/bodegas (supplier_payouts) nunca
-- descontaba wallet_balances (wallet_type='supplier') en ningun punto -- ni al crear la solicitud
-- ni al aprobarla (SupplierAccountantService.update() en Angular solo cambiaba el estado). Un
-- proveedor podia cobrar el mismo saldo una y otra vez sin que nunca bajara. Este RPC hace lo
-- mismo que process_withdrawal_request (referidos) pero para la billetera 'supplier': aprueba el
-- pago Y descuenta la billetera en una sola transaccion atomica, con guarda contra doble-proceso
-- (subir la foto del comprobante dos veces sobre el mismo pago ya no lo descuenta dos veces).

create or replace function process_supplier_payout(p_payout_id bigint, p_receipt_photo_url text)
returns void as $$
declare
  v_profile_id uuid;
  v_amount numeric;
  v_state int;
begin
  select profile_id, amount, state into v_profile_id, v_amount, v_state
  from supplier_payouts where id = p_payout_id;

  if v_profile_id is null then
    raise exception 'pago_no_encontrado';
  end if;

  if v_state = 1 then
    raise exception 'pago_ya_procesado';
  end if;

  perform debit_wallet(v_profile_id, 'supplier', v_amount, null, 'supplier_payout');

  update supplier_payouts
  set state = 1, paid_at = now(), receipt_photo_url = p_receipt_photo_url
  where id = p_payout_id;
end;
$$ language plpgsql;
