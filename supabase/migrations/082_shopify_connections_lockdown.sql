-- Hallazgo de seguridad (2026-07-27): shopify_connections tenia RLS "using(true)" para TODOS los
-- comandos (mismo patron de control-en-el-frontend que el resto del proyecto), pero esta tabla
-- guarda access_token/api_secret de Shopify EN TEXTO PLANO -- credenciales reales de terceros, no
-- datos de negocio internos. Con eso, cualquiera con la clave anonima (publica, viaja en el bundle
-- del sitio) podia:
--   1) Leer el access_token/api_secret de CUALQUIER vendedor directo por la API REST de Supabase.
--   2) Escribir/pisar esas columnas para CUALQUIER profile_id (sin pasar por shopify-connect ni
--      autenticarse), secuestrando el vendedor real hacia un Shopify que el atacante controla.
-- Ninguna pantalla del sitio hace select('*') ni insert/update directo sobre esta tabla (todo pasa
-- por la edge function shopify-connect, que usa la service_role key) -- confirmado grepeando ambos
-- repos antes de este cambio. Se cierra a nivel de permisos de Postgres (no de RLS, que sigue
-- using(true) para no romper el patron del resto del proyecto):
--   - anon/authenticated pierden INSERT/UPDATE/DELETE por completo sobre la tabla (solo la edge
--     function, con service_role, puede escribir).
--   - anon/authenticated pierden SELECT especificamente de access_token/api_secret (shop_domain/
--     connected_at/profile_id/active/id/shopify_webhook_id siguen legibles, son los que ya se leen
--     hoy desde /config/shopify y ViewProductosModal).
revoke insert, update, delete on public.shopify_connections from anon, authenticated;
revoke select (access_token, api_secret) on public.shopify_connections from anon, authenticated;
