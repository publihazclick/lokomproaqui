-- Pedido explicito del usuario 2026-07-27: la columna "E-mail" de /config/referidos existia en el
-- diseno original pero siempre estuvo vacia -- el correo real vive en auth.users, no accesible
-- desde el cliente con la clave anon/authenticated (no esta expuesto via PostgREST, es un schema
-- aparte). Mismo patron ya usado para "Entregas este mes" (fetch_entregas_mes, migracion 071):
-- un RPC batched (una sola llamada para toda la pagina cargada, no N+1) en vez de exponer auth.users
-- directamente. security definer para que pueda leer auth.users con los privilegios del dueno de la
-- funcion, sin necesidad de otorgarle a anon/authenticated acceso directo a ese schema.
create or replace function public.fetch_referidos_emails(p_profile_ids uuid[])
returns table(profile_id uuid, email text)
language sql
stable
security definer
set search_path = public, auth
as $$
  select id, email from auth.users where id = any(p_profile_ids);
$$;
