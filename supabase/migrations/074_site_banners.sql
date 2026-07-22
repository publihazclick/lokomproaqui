-- Banners de IMAGEN para usuarios logueados (pedido explicito del usuario 2026-07-22): reemplaza
-- el sistema viejo de banners de solo texto (notifications type=3, gestionado en
-- /config/configuracion) que ademas nunca se llego a mostrar a ningun usuario real -- se porto el
-- CRUD de admin en la migracion a Next.js pero nunca se construyo el lado de "mostrarselo a los
-- usuarios". El usuario ya tiene imagenes propias con las medidas correctas, no quiere texto.
-- Se muestran como carrusel arriba de /articulo (pagina de inicio real del catalogo logueado).

create table site_banners (
  id bigint generated always as identity primary key,
  image_url text not null,
  link_url text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table site_banners enable row level security;
create policy "site_banners_all" on site_banners for all using (true) with check (true);
