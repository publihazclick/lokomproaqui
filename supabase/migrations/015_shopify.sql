-- Integración Shopify: cada dropshipper conecta su propia tienda; los pedidos que le entran en
-- Shopify se crean automáticamente como `orders` normales (mismo camino que ventas manuales/whatsapp),
-- emparejando cada línea por SKU contra product_variants.sku. Si algún SKU no coincide, el pedido
-- completo queda en `shopify_pending_orders` para que el dropshipper lo relacione manualmente una vez.

create table shopify_connections (
  id bigint generated always as identity primary key,
  profile_id uuid not null unique references profiles(id),
  shop_domain text not null unique,
  access_token text not null,
  api_secret text not null,
  shopify_webhook_id text,
  active boolean not null default true,
  connected_at timestamptz not null default now()
);

-- Mapeos manuales confirmados: una vez el dropshipper relaciona un SKU de Shopify con un producto de
-- LokomproAqui en la pantalla de reconciliación, queda guardado aquí para que los siguientes pedidos
-- con ese mismo SKU se emparejen automáticamente.
create table shopify_sku_map (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles(id),
  shopify_sku text not null,
  product_id bigint not null references products(id),
  product_variant_id bigint references product_variants(id),
  created_at timestamptz not null default now(),
  unique (profile_id, shopify_sku)
);

-- Bandeja de pedidos de Shopify con al menos un SKU sin emparejar. `items` guarda las líneas del
-- pedido tal como vinieron de Shopify (sku, título, cantidad, precio) para la pantalla de revisión.
create table shopify_pending_orders (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles(id),
  shopify_order_id text not null,
  shopify_order_number text,
  buyer_name text,
  buyer_phone text,
  buyer_address text,
  buyer_city text,
  buyer_neighborhood text,
  financial_status text,
  items jsonb not null default '[]'::jsonb,
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (profile_id, shopify_order_id)
);

create index idx_shopify_pending_orders_profile on shopify_pending_orders(profile_id) where not resolved;

-- Para detectar reintentos del webhook de Shopify (entrega "al menos una vez") y no duplicar el pedido.
alter table orders add column shopify_order_id text unique;

alter table shopify_connections enable row level security;
alter table shopify_sku_map enable row level security;
alter table shopify_pending_orders enable row level security;

create policy "shopify_connections_all" on shopify_connections for all using (true) with check (true);
create policy "shopify_sku_map_all" on shopify_sku_map for all using (true) with check (true);
create policy "shopify_pending_orders_all" on shopify_pending_orders for all using (true) with check (true);
