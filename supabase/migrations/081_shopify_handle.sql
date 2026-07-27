-- Pedido explicito del usuario 2026-07-27: el boton "Compartir link" debe copiar el link real del
-- producto en la Shopify del vendedor (https://{shop_domain}/products/{handle}) cuando ya esta
-- empujado alla -- se guarda el handle que Shopify devuelve al crear/actualizar el producto.
alter table price_overrides
  add column if not exists shopify_handle text;
