-- Los pedidos 'dropshipping'/'muestra' son autofinanciados por la billetera del propio
-- dropshipper (ver debit_wallet); no existe comision de referido/proveedor que pagar sobre
-- ellos. Si un admin los aprueba por error desde cualquiera de las pantallas existentes,
-- approve_order debe limitarse a cerrar el pedido sin disparar pagos.
create or replace function approve_order(p_order_id bigint)
returns void as $$
declare
  v_already_paid boolean;
  v_order_type text;
begin
  select commission_paid, order_type into v_already_paid, v_order_type from orders where id = p_order_id;
  if v_already_paid then
    return;
  end if;

  if v_order_type in ('dropshipping', 'muestra') then
    update orders set status = 'success', commission_paid = true where id = p_order_id;
    return;
  end if;

  update orders set status = 'success', commission_paid = true where id = p_order_id;

  perform pay_referral_commissions(p_order_id);
  perform pay_supplier_commissions(p_order_id);
end;
$$ language plpgsql;
