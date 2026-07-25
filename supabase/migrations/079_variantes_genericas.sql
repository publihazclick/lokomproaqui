-- Generaliza el sistema de variantes de producto para que sirva para cualquier tipo de producto,
-- no solo ropa/calzado (color+talla). Cambio 100% aditivo, no rompe nada existente:
--
-- - products.variant1_label: nombre visible del primer eje de variante (ej "Color", "Sabor",
--   "Presentación"). Default 'Color' para que TODOS los productos existentes (que hoy siempre
--   tienen un valor en product_variants.color) sigan mostrandose exactamente igual sin backfill.
-- - products.variant2_label: nombre del segundo eje SOLO cuando se usa en modo libre (texto
--   escrito por el proveedor, ej "Capacidad"). NULL = sin segundo eje libre (el producto no tiene
--   segundo eje, o usa el catalogo real de tallas via size_type_id, cuyo nombre ya sale de
--   size_types.name).
-- - product_variants.size_label: valor libre del segundo eje cuando no se usa el catalogo real de
--   tallas (size_id queda null en ese caso). Antes, una variante sin size_id no tenia forma de
--   guardar ninguna etiqueta para ese eje (el catalogo era la unica fuente).

alter table products
  add column if not exists variant1_label text not null default 'Color',
  add column if not exists variant2_label text null;

alter table product_variants
  add column if not exists size_label text null;
