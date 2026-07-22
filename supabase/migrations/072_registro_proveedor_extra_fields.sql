-- El formulario de registro de proveedor (/registro, lokomproaqui-next) pide varios campos que
-- nunca llegaban al backend: nombre de bodega (se validaba disponible pero se ignoraba, el
-- referral_code real siempre salia de generate_referral_code()), indicativo, tipo de proveedor,
-- experiencia con dropshipping, si esta vinculado a otra plataforma (y cuales), departamento,
-- ciudad y direccion. Pedido explicito del usuario 2026-07-21: que todo lo que se pide se guarde.
--
-- city/address/phone_country_code/supplier_type/supplier_experience YA EXISTIAN (002/032), solo
-- nunca se llenaban desde el registro. department, supplier_linked_platform y supplier_platforms
-- son columnas nuevas, no tenian ningun equivalente en el esquema.

alter table profiles add column if not exists department text;
alter table profiles add column if not exists supplier_linked_platform boolean;
alter table profiles add column if not exists supplier_platforms text;

-- Reemplaza handle_new_user (ultima version real: migracion 063 + el bloqueo de full_name/phone
-- vacios que el usuario aplico directo en el SQL Editor el 2026-07-21, confirmado leyendo
-- pg_proc en produccion antes de tocar esta funcion -- se preserva tal cual, no se toca esa parte).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  ref_id uuid;
  es_proveedor boolean;
  v_referral_code text;
  v_desired_code text;
begin
  -- Bloquea cualquier registro (venga del formulario o de una llamada directa a la API de
  -- Supabase Auth) que no traiga nombre o celular -- pedido explicito del usuario 2026-07-21,
  -- perfiles sin estos datos no se pueden contactar para acompanamiento.
  if coalesce(new.raw_user_meta_data ->> 'full_name', '') = '' then
    raise exception 'El nombre es obligatorio para crear la cuenta';
  end if;

  if coalesce(new.raw_user_meta_data ->> 'phone', '') = '' then
    raise exception 'El celular es obligatorio para crear la cuenta';
  end if;

  if new.raw_user_meta_data ->> 'referrer_id' is not null then
    ref_id := (new.raw_user_meta_data ->> 'referrer_id')::uuid;
  elsif new.raw_user_meta_data ->> 'referral_code' is not null then
    select id into ref_id from profiles where referral_code = new.raw_user_meta_data ->> 'referral_code';
  end if;

  es_proveedor := (new.raw_user_meta_data ->> 'role_name' = 'proveedor');

  -- Nombre de bodega elegido en /registro (metadata 'desired_referral_code', distinto de
  -- 'referral_code' que arriba se usa para resolver el REFERENTE): si vino y sigue disponible se
  -- usa tal cual (ya viene sanitizado por el frontend, solo alfanumerico sin espacios); si no vino
  -- o ya lo tomo alguien mas en la carrera, se cae al generador aleatorio de siempre en vez de
  -- fallar el registro completo.
  v_desired_code := nullif(new.raw_user_meta_data ->> 'desired_referral_code', '');
  if v_desired_code is not null and not exists (select 1 from profiles where referral_code = v_desired_code) then
    v_referral_code := v_desired_code;
  else
    v_referral_code := generate_referral_code();
  end if;

  insert into profiles (
    id, referrer_id, role_id, full_name, last_name, phone, phone_country_code,
    referral_code, proveedor_numero, supplier_status,
    supplier_type, supplier_experience, supplier_linked_platform, supplier_platforms,
    department, city, address
  )
  values (
    new.id,
    ref_id,
    case when es_proveedor then (select id from roles where name = 'proveedor')
         else (select id from roles where name = 'vendedor') end,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'phone',
    coalesce(new.raw_user_meta_data ->> 'phone_country_code', '57'),
    v_referral_code,
    case when es_proveedor then nextval('proveedor_numero_seq') else null end,
    case when es_proveedor then 'incompleto'::supplier_status else null end,
    new.raw_user_meta_data ->> 'supplier_type',
    new.raw_user_meta_data ->> 'supplier_experience',
    case when new.raw_user_meta_data ->> 'supplier_linked_platform' is not null
         then (new.raw_user_meta_data ->> 'supplier_linked_platform')::boolean
         else null end,
    new.raw_user_meta_data ->> 'supplier_platforms',
    new.raw_user_meta_data ->> 'department',
    new.raw_user_meta_data ->> 'city',
    new.raw_user_meta_data ->> 'address'
  );
  return new;
end;
$function$;
