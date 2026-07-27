-- Hallazgo de seguridad (2026-07-27, mismo dia que el fix de shopify_connections): Supabase otorga
-- TRUNCATE por defecto a anon/authenticated en TODAS las tablas del esquema public. TRUNCATE NO lo
-- filtra RLS (opera sobre la tabla completa, no fila por fila) -- cualquiera con la clave anonima
-- (publica, va en el bundle del sitio) podia vaciar CUALQUIER tabla del proyecto (orders, profiles,
-- wallet_ledger, etc) de un solo request, sin autenticarse. Ninguna pantalla del sitio usa TRUNCATE
-- (no es una operacion que la aplicacion necesite nunca desde el cliente).
revoke truncate on all tables in schema public from anon, authenticated;

-- Para que las tablas que se creen despues de hoy tampoco hereden este permiso por defecto.
alter default privileges for role postgres in schema public revoke truncate on tables from anon, authenticated;
