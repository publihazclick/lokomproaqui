-- Pedido explicito del usuario 2026-07-27: al agregar un producto a "mi tienda" (price_overrides),
-- si el vendedor tiene una tienda Shopify conectada (shopify_connections), se crea el producto real
-- alla tambien. Estas columnas trackean el vinculo por vendedor+producto (ya es la fila unica
-- profile_id+product_id) para saber si hay que crear o actualizar, y para poder borrarlo despues.
alter table price_overrides
  add column if not exists shopify_product_id text,
  add column if not exists shopify_variant_map jsonb not null default '{}'::jsonb;
