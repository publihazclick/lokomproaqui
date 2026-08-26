-- Pedido explicito del usuario 2026-07-24: bajar el minimo de productos para que un proveedor
-- pueda enviar su cuenta a revision, de 3 a 1 -- baja la barrera de entrada para nuevos proveedores.
-- Reemplaza enviar_proveedor_a_revision (migracion 063) cambiando el umbral y el nombre de la
-- excepcion (ya no tiene sentido llamarla 'minimo_3_productos' si el minimo es 1).
CREATE OR REPLACE FUNCTION public.enviar_proveedor_a_revision(p_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_status supplier_status;
  v_count integer;
begin
  select supplier_status into v_status from profiles where id = p_profile_id for update;
  if v_status is null then
    raise exception 'no_es_proveedor';
  end if;
  if v_status in ('en_revision', 'aprobado') then
    return;
  end if;

  select count(*) into v_count from products where owner_profile_id = p_profile_id;
  if v_count < 1 then
    raise exception 'minimo_1_producto';
  end if;

  update profiles set supplier_status = 'en_revision', supplier_rejection_reason = null where id = p_profile_id;
end;
$function$;
