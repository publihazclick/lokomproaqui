-- Hito 3: pedidos (reemplaza Tblventas/Tblventasproducto; un pedido = una fila, no una fila por item)

create type order_status as enum (
  'pending', 'success', 'rejected', 'dispatched', 'invoiced', 'preparing', 'deleted'
);

create table orders (
  id bigint generated always as identity primary key,
  seller_id uuid references profiles(id),
  buyer_name text not null,
  buyer_phone text not null,
  buyer_address text,
  buyer_city text,
  buyer_neighborhood text,
  order_type text not null default 'contraentrega', -- contraentrega | pago_anticipado
  quantity_total int not null default 0,
  price_total numeric not null default 0,
  earnings_total numeric not null default 0,
  withdrawn boolean not null default false,
  status order_status not null default 'pending',
  group_id bigint references groups(id),
  commission_paid boolean not null default false,
  freight_value numeric,
  freight_payer text, -- tienda | cliente
  carrier text,
  tracking_number text,
  mipaquete_shipment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_orders_updated_at
  before update on orders
  for each row execute function set_updated_at();

create index idx_orders_seller on orders(seller_id);
create index idx_orders_status on orders(status);

create table order_items (
  id bigint generated always as identity primary key,
  order_id bigint not null references orders(id) on delete cascade,
  product_id bigint not null references products(id),
  product_variant_id bigint references product_variants(id),
  title text not null,
  unit_price numeric not null,
  quantity int not null,
  size text,
  color text,
  commission_pct numeric,
  seller_cost numeric,
  total_cost numeric,
  supplier_payout_id bigint -- FK a supplier_payouts agregada en 005_suppliers.sql
);

create index idx_order_items_order on order_items(order_id);

alter table orders enable row level security;
alter table order_items enable row level security;

create policy "orders_all" on orders for all using (true) with check (true);
create policy "order_items_all" on order_items for all using (true) with check (true);
