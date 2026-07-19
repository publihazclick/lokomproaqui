-- Refactor de raiz (pedido explicito del usuario 2026-07-19): en vez de INFERIR si el flete salio
-- de la wallet a partir de customer_prepaid_product/shipping_included/order_type (fragil -- ya
-- causo 2 bugs reales, migraciones 043 y 044), se agrega una columna explicita que se marca en el
-- momento EXACTO en que la wallet realmente se debita. approve_order/reject_order ahora solo leen
-- este flag, no vuelven a adivinar.
--
-- Tambien cierra el hueco mas amplio encontrado: FormVentaDetalleModal (Autorizar Despacho) NO
-- cobraba nada de la wallet para pedidos 'dropshipping'/'muestra' atascados sin guia abiertos
-- desde /config/ventas (solo cobraba para 'contraentrega') -- se corrige en el frontend para que
-- cobre siempre, sin importar el tipo de pedido, cuando se autoriza desde esta pantalla.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS freight_wallet_funded boolean NOT NULL DEFAULT false;

-- Backfill de pedidos ya existentes (mejor estimacion posible con los datos que hay, no afecta
-- dinero real todavia -- no hay guias reales generadas en produccion aun).
UPDATE orders SET freight_wallet_funded = true
WHERE freight_value IS NOT NULL AND freight_value > 0
  AND (
    order_type = 'contraentrega'
    OR (order_type IN ('dropshipping', 'muestra') AND NOT (COALESCE(customer_prepaid_product, false) AND NOT COALESCE(shipping_included, true)))
  );

CREATE OR REPLACE FUNCTION public.approve_order(p_order_id bigint)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_already_paid boolean;
  v_order_type text;
  v_seller_id uuid;
  v_freight numeric;
  v_flete_desde_wallet boolean;
begin
  select commission_paid, order_type, seller_id, freight_value, freight_wallet_funded
    into v_already_paid, v_order_type, v_seller_id, v_freight, v_flete_desde_wallet
    from orders where id = p_order_id;
  if v_already_paid then
    return;
  end if;

  update orders set status = 'success', commission_paid = true where id = p_order_id;

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
  v_flete_desde_wallet boolean;
begin
  select order_type, seller_id, freight_value, insurance_active, status, freight_wallet_funded
    into v_order_type, v_seller_id, v_freight, v_insured, v_prev_status, v_flete_desde_wallet
    from orders where id = p_order_id;

  update orders set status = 'rejected' where id = p_order_id;

  if v_prev_status <> 'rejected'
     and v_insured
     and v_flete_desde_wallet
     and v_seller_id is not null and v_freight is not null and v_freight > 0 then
    perform credit_wallet(v_seller_id, 'dropshipper', v_freight, p_order_id, null, 'flete_devuelto_seguro');
  end if;
end;
$function$;
