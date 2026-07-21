-- Fase 2 del plan de aislamiento proveedor<->vendedor: desde 065, un pedido de Shopify/WooCommerce
-- que trae productos de 2+ proveedores se divide en 2+ filas de `orders`, todas con el MISMO
-- shopify_order_id/woocommerce_order_id (para poder ubicarlas juntas) -- la restriccion unique de
-- antes ya no aplica, era correcta cuando era 1 pedido externo = 1 fila interna.

alter table orders drop constraint if exists orders_shopify_order_id_key;
alter table orders drop constraint if exists orders_woocommerce_order_id_key;

create index if not exists idx_orders_shopify_order_id on orders(shopify_order_id) where shopify_order_id is not null;
create index if not exists idx_orders_woocommerce_order_id on orders(woocommerce_order_id) where woocommerce_order_id is not null;
