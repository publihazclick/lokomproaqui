-- approve_order (023): agrega el kind 'flete_devuelto' al reembolso de flete por entrega exitosa.
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
      perform credit_wallet(v_seller_id, 'dropshipper', v_freight, p_order_id, null, 'flete_devuelto');
    end if;
    return;
  end if;

  update orders set status = 'success', commission_paid = true where id = p_order_id;

  perform pay_referral_commissions(p_order_id);
  perform pay_supplier_commissions(p_order_id);
end;
$$ language plpgsql;

-- Nuevo: marcar un pedido como "Devolucion" (ven_estado:2 en el panel admin). Antes esto era un
-- simple UPDATE sin logica de negocio. Ahora, para pedidos dropshipping/muestra: si el vendedor
-- pago el seguro antidevoluciones (+$5.000, no reembolsable), se le devuelve igual el flete que
-- prepago; sin seguro, no se devuelve nada (el vendedor pierde el flete, cubre el envio real que
-- si se hizo). Idempotente: si el pedido ya estaba 'rejected' no se reembolsa una segunda vez.
create or replace function reject_order(p_order_id bigint)
returns void as $$
declare
  v_order_type text;
  v_seller_id uuid;
  v_freight numeric;
  v_insured boolean;
  v_prev_status order_status;
begin
  select order_type, seller_id, freight_value, insurance_active, status
    into v_order_type, v_seller_id, v_freight, v_insured, v_prev_status
    from orders where id = p_order_id;

  update orders set status = 'rejected' where id = p_order_id;

  if v_prev_status <> 'rejected'
     and v_order_type in ('dropshipping', 'muestra')
     and v_insured
     and v_seller_id is not null and v_freight is not null and v_freight > 0 then
    perform credit_wallet(v_seller_id, 'dropshipper', v_freight, p_order_id, null, 'flete_devuelto_seguro');
  end if;
end;
$$ language plpgsql;
