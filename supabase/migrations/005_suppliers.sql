-- Hito 8: proveedores e inventario

create table supplier_stock_entries (
  id bigint generated always as identity primary key,
  entry_type int not null, -- 1 entrada, 2 salida, 3 devolucion
  entry_date date not null default current_date,
  description text,
  status int not null default 1,
  profile_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table supplier_stock_entry_items (
  id bigint generated always as identity primary key,
  entry_id bigint not null references supplier_stock_entries(id) on delete cascade,
  product_id bigint not null references products(id),
  product_variant_id bigint references product_variants(id),
  quantity int not null,
  entry_date date not null default current_date
);

create table supplier_payouts (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles(id),
  bank_id bigint, -- FK a banks agregada en 008_misc.sql
  amount numeric not null,
  paid_at timestamptz,
  state int not null default 0, -- 0 activo, 1 completado
  receipt_photo_url text,
  created_at timestamptz not null default now()
);

alter table order_items add constraint order_items_supplier_payout_fk foreign key (supplier_payout_id) references supplier_payouts(id);

alter table supplier_stock_entries enable row level security;
alter table supplier_stock_entry_items enable row level security;
alter table supplier_payouts enable row level security;

create policy "supplier_stock_entries_all" on supplier_stock_entries for all using (true) with check (true);
create policy "supplier_stock_entry_items_all" on supplier_stock_entry_items for all using (true) with check (true);
create policy "supplier_payouts_all" on supplier_payouts for all using (true) with check (true);
