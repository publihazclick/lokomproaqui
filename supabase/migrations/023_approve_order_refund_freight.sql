-- El dropshipper prepaga el flete desde su billetera 'dropshipper' para poder generar la guia
-- (ver debit_wallet en dropshipping-checkout). Cuando el pedido se marca como exitoso (admin
-- confirma que el cliente ya pago el producto contra entrega al mensajero), ese flete ya no es
-- un gasto: se le devuelve integro a su billetera para que pueda seguir despachando pedidos.
create or replace function approve_order(p_order_id bigint)
returns void as $$
declare
  v_already_paid boolean;
  v_order_type text;
  v_seller_id uuid;
  v_freight numeric;
begin
  select commission_paid, order_type, seller_id, freight_value
    into v_already_paid, v_order_type, v_seller_id, v_freight
    from orders where id = p_order_id;
  if v_already_paid then
    return;
  end if;

  if v_order_type in ('dropshipping', 'muestra') then
    update orders set status = 'success', commission_paid = true where id = p_order_id;
    if v_seller_id is not null and v_freight is not null and v_freight > 0 then
      perform credit_wallet(v_seller_id, 'dropshipper', v_freight, p_order_id, null);
    end if;
    return;
  end if;

  update orders set status = 'success', commission_paid = true where id = p_order_id;

  perform pay_referral_commissions(p_order_id);
  perform pay_supplier_commissions(p_order_id);
end;
$$ language plpgsql;
