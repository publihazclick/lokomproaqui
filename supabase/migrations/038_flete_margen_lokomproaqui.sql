-- Margen fijo de LokomproAqui sobre el flete ($4.000 COP por guia, pedido explicito del usuario
-- 2026-07-18). El aumento se suma UNA sola vez, en mipaquete-quote/index.ts (edge function), sobre
-- el flete_costo real que devuelve Mipaquete -- desde ahi el numero ya marcado se guarda como
-- orders.freight_value y se propaga solo al recaudo contra entrega y al debito de la wallet
-- dropshipper, sin tocar mas codigo.
--
-- Este archivo ajusta el otro lado de la cuenta: approve_order/reject_order devolvian el 100% de
-- lo debitado de la wallet dropshipper cuando el pedido se resolvia (exitoso, o devuelto con
-- seguro) -- eso incluia el aumento, dejando el margen en $0 neto. Ahora solo se devuelve el costo
-- real de Mipaquete (freight_value - 4000), el usuario confirmo explicitamente que el margen se
-- queda SIEMPRE, sin importar el resultado final del pedido (exitoso o devolucion asegurada).

CREATE OR REPLACE FUNCTION public.approve_order(p_order_id bigint)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
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
begin
  select order_type, seller_id, freight_value, insurance_active, status
    into v_order_type, v_seller_id, v_freight, v_insured, v_prev_status
    from orders where id = p_order_id;

  update orders set status = 'rejected' where id = p_order_id;

  if v_prev_status <> 'rejected'
     and v_order_type in ('dropshipping', 'muestra')
     and v_insured
     and v_seller_id is not null and v_freight is not null and v_freight > 0 then
    perform credit_wallet(v_seller_id, 'dropshipper', greatest(v_freight - 4000, 0), p_order_id, null, 'flete_devuelto_seguro');
  end if;
end;
$function$;
