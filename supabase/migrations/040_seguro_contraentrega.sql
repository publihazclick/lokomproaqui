-- Seguro antidevoluciones ampliado a ventas contra entrega (pedido explicito del usuario
-- 2026-07-19, MISMA logica que ya existia en dropshipping/muestra): si el vendedor lo activa al
-- autorizar el despacho, prepaga flete+5000 desde su wallet 'dropshipper' -- igual mecanismo,
-- reusando debit_wallet/credit_wallet tal cual.
--
-- Diferencia clave con dropshipping/muestra: 'contraentrega' SI debe pagar comisiones multinivel
-- (pay_referral_commissions/pay_supplier_commissions) en un pedido exitoso, sea o no asegurado --
-- dropshipping/muestra nunca las pagan (son autofinanciados, no hay "venta real" para la cadena de
-- referidos). El seguro en contraentrega es un add-on sobre el flujo normal, no un reemplazo.

CREATE OR REPLACE FUNCTION public.approve_order(p_order_id bigint)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_already_paid boolean;
  v_order_type text;
  v_seller_id uuid;
  v_freight numeric;
  v_insured boolean;
  v_flete_desde_wallet boolean;
begin
  select commission_paid, order_type, seller_id, freight_value, insurance_active
    into v_already_paid, v_order_type, v_seller_id, v_freight, v_insured
    from orders where id = p_order_id;
  if v_already_paid then
    return;
  end if;

  update orders set status = 'success', commission_paid = true where id = p_order_id;

  -- dropshipping/muestra: el flete SIEMPRE sale de la wallet (comportamiento historico, sin
  -- cambios) -- se devuelve al exito sin importar el seguro. contraentrega: el flete solo sale de
  -- la wallet si el vendedor activo el seguro (nuevo).
  v_flete_desde_wallet := v_order_type in ('dropshipping', 'muestra') or (v_order_type = 'contraentrega' and v_insured);

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
begin
  select order_type, seller_id, freight_value, insurance_active, status
    into v_order_type, v_seller_id, v_freight, v_insured, v_prev_status
    from orders where id = p_order_id;

  update orders set status = 'rejected' where id = p_order_id;

  if v_prev_status <> 'rejected'
     and v_order_type in ('dropshipping', 'muestra', 'contraentrega')
     and v_insured
     and v_seller_id is not null and v_freight is not null and v_freight > 0 then
    perform credit_wallet(v_seller_id, 'dropshipper', greatest(v_freight - 4000, 0), p_order_id, null, 'flete_devuelto_seguro');
  end if;
end;
$function$;
