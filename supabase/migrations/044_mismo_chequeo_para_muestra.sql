-- Mismo hueco de la migracion 043, camino distinto: FormVentaDetalleModal (el mismo formulario de
-- "Autorizar Despacho") tambien se abre desde /config/ventas para CUALQUIER pedido, incluidos los
-- de 'muestra' que hayan quedado sin guia -- ahi el checkbox "cliente ya pago" no esta restringido
-- por tipo de pedido (solo por si ya hay guia). La correccion anterior asumio que 'muestra' SIEMPRE
-- paga el flete desde la wallet sin excepcion, sin chequear la combinacion real -- dejando la misma
-- puerta abierta por un camino menos obvio. Se trata 'muestra' igual que 'dropshipping' en este
-- chequeo puntual (aunque su checkout normal nunca ofrezca la combinacion, es una defensa real
-- contra el camino admin/FormVentaDetalleModal).

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

  update orders set status = 'success', commission_paid = true where id = p_order_id;

  v_flete_desde_wallet := v_order_type = 'contraentrega'
    or (v_order_type in ('dropshipping', 'muestra') and not (coalesce(v_prepaid_product, false) and not coalesce(v_shipping_included, true)));

  if v_flete_desde_wallet and v_seller_id is not null and v_freight is not null and v_freight > 0 then
    perform credit_wallet(v_seller_id, 'dropshipper', greatest(v_freight - 4000, 0), p_order_id, null, 'flete_devuelto');
  end if;

  if v_order_type in ('dropshipping', 'muestra') then
    return;
  end if;

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

  v_flete_desde_wallet := v_order_type = 'contraentrega'
    or (v_order_type in ('dropshipping', 'muestra') and not (coalesce(v_prepaid_product, false) and not coalesce(v_shipping_included, true)));

  if v_prev_status <> 'rejected'
     and v_order_type in ('dropshipping', 'muestra', 'contraentrega')
     and v_insured
     and v_flete_desde_wallet
     and v_seller_id is not null and v_freight is not null and v_freight > 0 then
    perform credit_wallet(v_seller_id, 'dropshipper', v_freight, p_order_id, null, 'flete_devuelto_seguro');
  end if;
end;
$function$;
