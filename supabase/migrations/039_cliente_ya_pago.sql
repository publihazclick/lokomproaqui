-- "Mi cliente ya me pago el producto" (Hacer Dropshipping): cuando el vendedor confirma que su
-- cliente le pago el producto por fuera de la plataforma, el mensajero ya no debe cobrar el
-- producto contra entrega -- ese valor se descuenta de la wallet del vendedor en su lugar. El
-- flete puede seguir cobrandose en destino (mensajero) o tambien pagarse desde la wallet, segun
-- el toggle existente "Envio incluido/aparte" (shipping_included), que se reusa con este nuevo
-- significado cuando customer_prepaid_product = true. Pedido explicito del usuario 2026-07-18.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_prepaid_product boolean NOT NULL DEFAULT false;

-- approve_order/reject_order: el flete SOLO se devuelve si de verdad se pago desde la wallet.
-- Antes de esta migracion, el flete siempre se pagaba desde la wallet en dropshipping/muestra (sin
-- excepcion), por eso el codigo viejo nunca chequeaba esto. Ahora hay un caso real donde el flete
-- NO sale de la wallet (customer_prepaid_product=true Y shipping_included=false: el cliente ya
-- pago el producto pero el flete se lo cobra el mensajero aparte) -- en ese caso no hay nada que
-- devolver, porque nunca se debito.

CREATE OR REPLACE FUNCTION public.approve_order(p_order_id bigint)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_already_paid boolean;
  v_order_type text;
  v_seller_id uuid;
  v_freight numeric;
  v_prepaid_product boolean;
  v_shipping_included boolean;
  v_flete_desde_wallet boolean;
begin
  select commission_paid, order_type, seller_id, freight_value, customer_prepaid_product, shipping_included
    into v_already_paid, v_order_type, v_seller_id, v_freight, v_prepaid_product, v_shipping_included
    from orders where id = p_order_id;
  if v_already_paid then
    return;
  end if;

  if v_order_type in ('dropshipping', 'muestra') then
    update orders set status = 'success', commission_paid = true where id = p_order_id;
    v_flete_desde_wallet := not (coalesce(v_prepaid_product, false) and not coalesce(v_shipping_included, true));
    if v_seller_id is not null and v_freight is not null and v_freight > 0 and v_flete_desde_wallet then
      perform credit_wallet(v_seller_id, 'dropshipper', greatest(v_freight - 4000, 0), p_order_id, null, 'flete_devuelto');
    end if;
    return;
  end if;

  update orders set status = 'success', commission_paid = true where id = p_order_id;

  perform pay_referral_commissions(p_order_id);
  perform pay_supplier_commissions(p_order_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.reject_order(p_order_id bigint)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_order_type text;
  v_seller_id uuid;
  v_freight numeric;
  v_insured boolean;
  v_prev_status order_status;
  v_prepaid_product boolean;
  v_shipping_included boolean;
  v_flete_desde_wallet boolean;
begin
  select order_type, seller_id, freight_value, insurance_active, status, customer_prepaid_product, shipping_included
    into v_order_type, v_seller_id, v_freight, v_insured, v_prev_status, v_prepaid_product, v_shipping_included
    from orders where id = p_order_id;

  update orders set status = 'rejected' where id = p_order_id;

  v_flete_desde_wallet := not (coalesce(v_prepaid_product, false) and not coalesce(v_shipping_included, true));

  if v_prev_status <> 'rejected'
     and v_order_type in ('dropshipping', 'muestra')
     and v_insured
     and v_flete_desde_wallet
     and v_seller_id is not null and v_freight is not null and v_freight > 0 then
    perform credit_wallet(v_seller_id, 'dropshipper', greatest(v_freight - 4000, 0), p_order_id, null, 'flete_devuelto_seguro');
  end if;
end;
$function$;
