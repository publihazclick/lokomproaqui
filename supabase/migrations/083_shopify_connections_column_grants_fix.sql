-- Fix del intento anterior (082): un REVOKE SELECT (columnas) no tiene efecto cuando el privilegio
-- original fue otorgado a nivel de TABLA completa (GRANT SELECT ON TABLE ... TO role), que es como
-- Supabase otorga los permisos por defecto -- el grant de tabla sigue permitiendo leer todas las
-- columnas sin importar el REVOKE parcial. La forma correcta es revocar el SELECT de tabla completa
-- y volver a otorgarlo solo sobre las columnas seguras.
revoke select on public.shopify_connections from anon, authenticated;
grant select (id, profile_id, shop_domain, connected_at, active, shopify_webhook_id)
  on public.shopify_connections to anon, authenticated;
