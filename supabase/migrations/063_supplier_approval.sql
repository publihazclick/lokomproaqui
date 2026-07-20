-- Aprobacion de proveedores (pedido explicito del usuario 2026-07-20): un proveedor recien
-- registrado NO debe aparecer en "Explorar Bodegas" hasta que (1) suba minimo 3 referencias de
-- producto, (2) las envie a revision, y (3) el admin lo apruebe explicitamente. Antes de esta
-- migracion CUALQUIER perfil con role_id='proveedor' aparecia de inmediato en Explorar Bodegas y en
-- la galeria publica de /infoSupplier, sin ningun filtro de calidad real pese a que esa pantalla ya
-- se titulaba "Bodegas Certificadas".

CREATE TYPE supplier_status AS ENUM ('incompleto', 'en_revision', 'aprobado', 'rechazado');

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS supplier_status supplier_status;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS supplier_rejection_reason text;

-- Grandfather: los proveedores que YA estaban visibles en Explorar Bodegas antes de este cambio no
-- deben desaparecer de golpe -- solo los proveedores NUEVOS de aca en adelante pasan por el flujo.
UPDATE profiles SET supplier_status = 'aprobado'
WHERE role_id = (SELECT id FROM roles WHERE name = 'proveedor') AND supplier_status IS NULL;

-- handle_new_user (migracion 032): se agrega supplier_status='incompleto' SOLO para registros nuevos
-- de proveedor, mismo criterio ya usado ahi para proveedor_numero. El resto de la funcion no cambia.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ref_id uuid;
  es_proveedor boolean;
begin
  if new.raw_user_meta_data ->> 'referrer_id' is not null then
    ref_id := (new.raw_user_meta_data ->> 'referrer_id')::uuid;
  elsif new.raw_user_meta_data ->> 'referral_code' is not null then
    select id into ref_id from profiles where referral_code = new.raw_user_meta_data ->> 'referral_code';
  end if;

  es_proveedor := (new.raw_user_meta_data ->> 'role_name' = 'proveedor');

  insert into profiles (id, referrer_id, role_id, full_name, last_name, phone, referral_code, proveedor_numero, supplier_status)
  values (
    new.id,
    ref_id,
    case when es_proveedor then (select id from roles where name = 'proveedor')
         else (select id from roles where name = 'vendedor') end,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'phone',
    generate_referral_code(),
    case when es_proveedor then nextval('proveedor_numero_seq') else null end,
    case when es_proveedor then 'incompleto'::supplier_status else null end
  );
  return new;
end;
$function$;

-- El proveedor dispara esto al hacer click en "Enviar a revision" (paso "Productos" del panel) --
-- valida server-side el minimo de 3 referencias (cualquier producto que le pertenezca, sin importar
-- si el admin ya activo cada uno individualmente -- ese es un flujo de aprobacion POR PRODUCTO
-- distinto, ver products.pending_review, esto es aprobacion DE LA CUENTA de proveedor). Idempotente:
-- si ya esta en_revision o aprobado, no hace nada.
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
  if v_count < 3 then
    raise exception 'minimo_3_productos';
  end if;

  update profiles set supplier_status = 'en_revision', supplier_rejection_reason = null where id = p_profile_id;
end;
$function$;
