-- Correccion de negocio (pedido explicito del usuario 2026-07-19): en una DEVOLUCION con seguro
-- antidevoluciones activo, se le devuelve al vendedor el flete COMPLETO (costo real de Mipaquete +
-- el margen de $4.000), no flete-4.000 como en una entrega exitosa -- en una devolucion la
-- plataforma solo se queda con la prima del seguro ($5.000), no tambien con el margen del flete.
-- approve_order (entrega exitosa) NO cambia: ahi si se sigue devolviendo flete-4.000 (con o sin
-- seguro), la plataforma se queda con el margen porque el servicio SI se completo.

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
    perform credit_wallet(v_seller_id, 'dropshipper', v_freight, p_order_id, null, 'flete_devuelto_seguro');
  end if;
end;
$function$;
