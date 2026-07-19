-- Ya no existe "contra entrega sin prepago" (pedido explicito del usuario 2026-07-19): TODO
-- pedido -- 'contraentrega' incluido, con o sin seguro -- exige que el vendedor tenga saldo
-- suficiente en su wallet 'dropshipper' para el flete antes de poder generar la guia (ver
-- FormVentaDetalleModal, autorizarDespacho). Por eso approve_order ahora devuelve el flete al
-- exito para 'contraentrega' SIEMPRE, no solo cuando esta asegurado -- el flete SIEMPRE salio de
-- la wallet, asi que SIEMPRE hay algo que devolver en una entrega exitosa.
--
-- reject_order NO cambia en esta migracion: el seguro sigue siendo lo unico que determina si el
-- flete se devuelve en una DEVOLUCION (esa es literalmente la funcion del seguro). Lo nuevo es
-- solo el requisito de saldo para poder generar la guia en primer lugar.

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

  update orders set status = 'success', commission_paid = true where id = p_order_id;

  -- El flete SIEMPRE sale de la wallet ahora, en los 3 tipos de pedido -- se devuelve al exito
  -- sin importar el seguro (el seguro solo protege contra una DEVOLUCION, ver reject_order).
  if v_order_type in ('dropshipping', 'muestra', 'contraentrega')
     and v_seller_id is not null and v_freight is not null and v_freight > 0 then
    perform credit_wallet(v_seller_id, 'dropshipper', greatest(v_freight - 4000, 0), p_order_id, null, 'flete_devuelto');
  end if;

  if v_order_type in ('dropshipping', 'muestra') then
    return;
  end if;

  perform pay_referral_commissions(p_order_id);
  perform pay_supplier_commissions(p_order_id);
end;
$function$;
