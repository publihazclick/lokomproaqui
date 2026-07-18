-- ID secuencial legible para proveedores (empieza en 200, +1 en orden de registro), para poder
-- filtrar/identificar proveedores sin exponer el uuid interno. Pedido explicito del usuario
-- 2026-07-18.

CREATE SEQUENCE IF NOT EXISTS proveedor_numero_seq START WITH 200 INCREMENT BY 1;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS proveedor_numero integer;
ALTER TABLE profiles ADD CONSTRAINT profiles_proveedor_numero_key UNIQUE (proveedor_numero);

-- Backfill de proveedores ya registrados, en orden de creacion (el mas antiguo queda en 200).
WITH ordenados AS (
  SELECT id, row_number() OVER (ORDER BY created_at) AS rn
  FROM profiles
  WHERE role_id = (SELECT id FROM roles WHERE name = 'proveedor')
    AND proveedor_numero IS NULL
)
UPDATE profiles p
SET proveedor_numero = 199 + ordenados.rn
FROM ordenados
WHERE p.id = ordenados.id;

-- Deja la secuencia lista para continuar justo despues del ultimo numero ya asignado.
SELECT setval('proveedor_numero_seq', COALESCE((SELECT max(proveedor_numero) FROM profiles), 199));

-- handle_new_user: asigna el siguiente numero de secuencia SOLO cuando el registro es de un
-- proveedor (mismo criterio que ya usa la funcion para elegir el role_id) -- vendedores/otros
-- roles quedan con proveedor_numero NULL.
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

  insert into profiles (id, referrer_id, role_id, full_name, last_name, phone, referral_code, proveedor_numero)
  values (
    new.id,
    ref_id,
    case when es_proveedor then (select id from roles where name = 'proveedor')
         else (select id from roles where name = 'vendedor') end,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'phone',
    generate_referral_code(),
    case when es_proveedor then nextval('proveedor_numero_seq') else null end
  );
  return new;
end;
$function$;
