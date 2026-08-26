-- Cierre de la auditoria de seguridad iniciada 2026-08-25 (correo real de Supabase Security
-- Advisor). La sesion anterior ya reemplazo la mayoria de las politicas "for all using(true)" del
-- esquema por politicas reales (_own_or_admin, via loko_is_admin()), pero quedaron 10 tablas sin
-- tocar -- esta migracion las cierra, revisando en cada caso desde el codigo real (lokomproaqui-next
-- + edge functions) quien necesita de verdad leer/escribir cada una, para no romper ninguna
-- pantalla en produccion.

-- 1) customer_risk_profile: sin owner (clave = telefono), solo se escribe via el trigger
-- update_customer_risk_profile() en orders (migracion 049). Ese trigger NO es SECURITY DEFINER
-- hoy, asi que corre con los permisos del usuario que aprobo/rechazo el pedido (approve_order/
-- reject_order tampoco son SECURITY DEFINER) -- si le quito el INSERT/UPDATE publico a la tabla sin
-- tocar el trigger, se rompe la aprobacion/rechazo de pedidos para cualquier no-admin. Se arregla
-- de raiz: el trigger pasa a SECURITY DEFINER (mismo patron que loko_is_admin()), y la tabla se
-- cierra para que solo el trigger (y un admin manual) puedan escribir. La lectura se necesita desde
-- el cliente real (fetchRiesgoComprador en ventas.ts, un vendedor consultando el riesgo de un
-- comprador por telefono antes de aceptar el pedido) -- se deja abierta a cualquier usuario
-- autenticado, no a anonimos.
alter function public.update_customer_risk_profile() security definer set search_path = public;

drop policy if exists customer_risk_profile_all on customer_risk_profile;
create policy customer_risk_profile_select_authenticated on customer_risk_profile
  for select using (auth.uid() is not null or loko_is_admin());
create policy customer_risk_profile_write_admin on customer_risk_profile
  for all using (loko_is_admin()) with check (loko_is_admin());

-- 2) groups: tiene owner_profile_id pero no se usa desde lokomproaqui-next (solo desde
-- empresa.service.ts del Angular viejo, ya sin trafico real) -- se cierra al mismo patron _own que
-- el resto del proyecto por si vuelve a usarse, no hay motivo para que sea publica.
drop policy if exists groups_all on groups;
create policy groups_own_or_admin on groups
  for all using (owner_profile_id = auth.uid() or loko_is_admin())
  with check (owner_profile_id = auth.uid() or loko_is_admin());

-- 3) price_overrides: a diferencia del resto, SI necesita lectura publica real -- /front (vitrina
-- publica sin login de un vendedor, fetchProductosTienda en front.ts) arma el catalogo de precios
-- de un vendedor leyendo esta tabla filtrada por profile_id+active, sin sesion. Se deja el SELECT
-- publico solo para filas activas; el resto (inactivas, y todo INSERT/UPDATE/DELETE) queda al
-- dueño real o admin, coherente con como ya escribe el cliente (productos.ts/bodega.ts/shopify.ts/
-- verProveedor.ts, siempre filtrando por profile_id = usuario logueado).
drop policy if exists price_overrides_all on price_overrides;
create policy price_overrides_select_active_or_own on price_overrides
  for select using (active = true or profile_id = auth.uid() or loko_is_admin());
create policy price_overrides_write_own_or_admin on price_overrides
  for insert with check (profile_id = auth.uid() or loko_is_admin());
create policy price_overrides_update_own_or_admin on price_overrides
  for update using (profile_id = auth.uid() or loko_is_admin())
  with check (profile_id = auth.uid() or loko_is_admin());
create policy price_overrides_delete_own_or_admin on price_overrides
  for delete using (profile_id = auth.uid() or loko_is_admin());

-- 4) product_comments: por diseño (migracion 014) es un formulario PUBLICO Y ANONIMO sin cuenta
-- (nombre/email libres) en la pagina de un producto -- igual que testimonials es distinto de esta
-- tabla, el SELECT/INSERT publicos son intencionales, no un bug. Lo que si es un bug real de
-- seguridad: hoy cualquiera puede tambien UPDATE/DELETE el comentario de OTRA persona (vandalismo/
-- borrado masivo) y leer comentarios con status=1 (eliminados/ocultos, incluye emails que no
-- deberian scrapearse). Se deja el INSERT/SELECT(activos) publicos, se cierra UPDATE/DELETE a admin.
drop policy if exists product_comments_all on product_comments;
create policy product_comments_select_active on product_comments
  for select using (status = 0 or loko_is_admin());
create policy product_comments_insert_public on product_comments
  for insert with check (status = 0);
create policy product_comments_write_admin on product_comments
  for update using (loko_is_admin()) with check (loko_is_admin());
create policy product_comments_delete_admin on product_comments
  for delete using (loko_is_admin());

-- 5) shipment_settlement_logs: logs financieros de conciliacion de fletes (order_id/profile_id/
-- data/status). Se escriben de verdad SOLO desde edge functions (mipaquete-sync-tracking,
-- mipaquete-track, whatsapp-webhook) con SUPABASE_SERVICE_ROLE_KEY, que bypasea RLS por completo --
-- no hay ningun caso de uso real del cliente (lokomproaqui-next) escribiendo esta tabla directo hoy
-- (el unico caller cliente-side, history-settlement-fletes.service.ts, es Angular viejo sin
-- trafico). Igual que wallet_ledger (ya arreglado por la sesion anterior), se deja el SELECT a
-- dueño/admin y se cierra la escritura a admin (las edge functions no dependen de RLS).
drop policy if exists shipment_settlement_logs_all on shipment_settlement_logs;
create policy shipment_settlement_logs_select_own_or_admin on shipment_settlement_logs
  for select using (profile_id = auth.uid() or loko_is_admin());
create policy shipment_settlement_logs_write_admin on shipment_settlement_logs
  for all using (loko_is_admin()) with check (loko_is_admin());

-- 6) site_uptime_status: monitoreo interno (target/url/is_up/consecutive_failures/...), escrito
-- solo por la edge function uptime-check (service_role). Ninguna pantalla del sitio la lee -- no
-- hay motivo para que sea publica ni siquiera de solo lectura.
drop policy if exists site_uptime_status_all on site_uptime_status;
create policy site_uptime_status_admin_only on site_uptime_status
  for all using (loko_is_admin()) with check (loko_is_admin());

-- 7) supplier_stock_entries: "Entrada/Salida Inventario" del proveedor (controlInventario.ts) --
-- un proveedor ve/gestiona solo sus propios movimientos, el admin ve todos (fetchMovimientos ya
-- distingue esAdmin en el cliente, ahora tambien lo hace el servidor).
drop policy if exists supplier_stock_entries_all on supplier_stock_entries;
create policy supplier_stock_entries_own_or_admin on supplier_stock_entries
  for all using (profile_id = auth.uid() or loko_is_admin())
  with check (profile_id = auth.uid() or loko_is_admin());

-- 8) supplier_stock_entry_items: hereda el dueño de su supplier_stock_entries padre (no tiene
-- profile_id propio) -- mismo patron que order_items respecto de orders.
drop policy if exists supplier_stock_entry_items_all on supplier_stock_entry_items;
create policy supplier_stock_entry_items_via_parent on supplier_stock_entry_items
  for all using (
    exists (select 1 from supplier_stock_entries e where e.id = supplier_stock_entry_items.entry_id and (e.profile_id = auth.uid() or loko_is_admin()))
  )
  with check (
    exists (select 1 from supplier_stock_entries e where e.id = supplier_stock_entry_items.entry_id and (e.profile_id = auth.uid() or loko_is_admin()))
  );

-- 9) testimonials: testimonios CURADOS (distinto de product_comments), ligados a un profile_id
-- real. La gestion completa (crear a nombre de otro usuario, aprobar/editar/eliminar, ver
-- pendientes) es exclusivamente admin (testimoniosAdmin.ts, panel /config/testimonios). El unico
-- acceso de cliente normal es de LECTURA de los aprobados (status=0) en /testimonio, detras de
-- login -- se deja igual (autenticado, no anonimo) para no exponer telefono/ciudad de los autores
-- a scraping sin cuenta.
drop policy if exists testimonials_all on testimonials;
create policy testimonials_select_active_authenticated on testimonials
  for select using ((status = 0 and auth.uid() is not null) or loko_is_admin());
create policy testimonials_write_admin on testimonials
  for all using (loko_is_admin()) with check (loko_is_admin());

-- 10) user_categories: categorias que un vendedor/proveedor marca en su propio perfil
-- (fetchCategoriasSeleccionadas en perfil.ts) -- solo se lee/escribe siempre filtrado por el propio
-- profile_id, sin ningun caso de lectura publica de categorias de otro usuario.
drop policy if exists user_categories_all on user_categories;
create policy user_categories_own_or_admin on user_categories
  for all using (profile_id = auth.uid() or loko_is_admin())
  with check (profile_id = auth.uid() or loko_is_admin());
