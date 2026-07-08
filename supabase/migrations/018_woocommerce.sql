-- Integración WooCommerce: mismo patrón que Shopify (ver 015_shopify.sql). Cada dropshipper conecta
-- su propia tienda WordPress/WooCommerce con sus claves de la API REST; los pedidos nuevos llegan por
-- webhook, se emparejan por SKU contra product_variants.sku, y se crean como `orders` normales (mismo
-- camino que ventas manuales/whatsapp). Si algún SKU no coincide, el pedido completo queda en
-- `woocommerce_pending_orders` para que el dropshipper lo relacione manualmente una vez.

create table woocommerce_connections (
  id bigint generated always as identity primary key,
  profile_id uuid not null unique references profiles(id),
  store_url text not null unique,
  consumer_key text not null,
  consumer_secret text not null,
  woocommerce_webhook_id text,
  webhook_secret text not null,
  active boolean not null default true,
  connected_at timestamptz not null default now()
);

-- Mapeos manuales confirmados: una vez el dropshipper relaciona un SKU de WooCommerce con un producto
-- de LokomproAqui en la pantalla de reconciliación, queda guardado aquí para que los siguientes
-- pedidos con ese mismo SKU se emparejen automáticamente.
create table woocommerce_sku_map (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles(id),
  woocommerce_sku text not null,
  product_id bigint not null references products(id),
  product_variant_id bigint references product_variants(id),
  created_at timestamptz not null default now(),
  unique (profile_id, woocommerce_sku)
);

-- Bandeja de pedidos de WooCommerce con al menos un SKU sin emparejar. `items` guarda las líneas del
-- pedido tal como vinieron de WooCommerce (sku, título, cantidad, precio) para la pantalla de revisión.
create table woocommerce_pending_orders (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles(id),
  woocommerce_order_id text not null,
  woocommerce_order_number text,
  buyer_name text,
  buyer_phone text,
  buyer_address text,
  buyer_city text,
  buyer_neighborhood text,
  financial_status text,
  items jsonb not null default '[]'::jsonb,
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (profile_id, woocommerce_order_id)
);

create index idx_woocommerce_pending_orders_profile on woocommerce_pending_orders(profile_id) where not resolved;

-- Para detectar reintentos del webhook de WooCommerce y no duplicar el pedido.
alter table orders add column woocommerce_order_id text unique;

alter table woocommerce_connections enable row level security;
alter table woocommerce_sku_map enable row level security;
alter table woocommerce_pending_orders enable row level security;

create policy "woocommerce_connections_all" on woocommerce_connections for all using (true) with check (true);
create policy "woocommerce_sku_map_all" on woocommerce_sku_map for all using (true) with check (true);
create policy "woocommerce_pending_orders_all" on woocommerce_pending_orders for all using (true) with check (true);
