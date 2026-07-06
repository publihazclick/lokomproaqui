-- Hito 2: catálogo de productos

create table categories (
  id bigint generated always as identity primary key,
  name text not null,
  slug text not null unique,
  description text,
  parent_id bigint references categories(id),
  active boolean not null default true,
  image_url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_categories_updated_at
  before update on categories
  for each row execute function set_updated_at();

alter table user_categories add constraint user_categories_category_fk foreign key (category_id) references categories(id) on delete cascade;

create table size_types (
  id bigint generated always as identity primary key,
  name text not null unique,
  active boolean not null default true,
  sort_order int not null default 0
);

create table sizes (
  id bigint generated always as identity primary key,
  name text not null,
  size_type_id bigint not null references size_types(id) on delete cascade,
  active boolean not null default true,
  sort_order int not null default 0
);

create table products (
  id bigint generated always as identity primary key,
  name text not null,
  slug text not null unique,
  image_url text,
  description text,
  short_description text,
  brand text,
  category_id bigint references categories(id),
  subcategory_id bigint references categories(id),
  active boolean not null default true,
  show_when_sold_out boolean not null default false,
  code text,
  owner_profile_id uuid references profiles(id),
  client_sale_price numeric,
  size_type_id bigint references size_types(id),
  wholesale_enabled boolean not null default false,
  gallery jsonb not null default '[]'::jsonb,
  details jsonb not null default '[]'::jsonb,
  position int not null default 0,
  width numeric,
  height numeric,
  length numeric,
  weight numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_products_updated_at
  before update on products
  for each row execute function set_updated_at();

create index idx_products_category on products(category_id);
create index idx_products_owner on products(owner_profile_id);

create table product_variants (
  id bigint generated always as identity primary key,
  product_id bigint not null references products(id) on delete cascade,
  color text,
  size_id bigint references sizes(id),
  sku text,
  stock int not null default 0 check (stock >= 0),
  price_override numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, color, size_id)
);

create trigger trg_product_variants_updated_at
  before update on product_variants
  for each row execute function set_updated_at();

create table product_wholesale_prices (
  id bigint generated always as identity primary key,
  product_id bigint not null references products(id) on delete cascade,
  min_qty int not null,
  price numeric not null
);

create table price_overrides (
  id bigint generated always as identity primary key,
  product_id bigint not null references products(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  price numeric not null,
  active boolean not null default true,
  unique (product_id, profile_id)
);

create table catalogs (
  id bigint generated always as identity primary key,
  title text not null,
  status int not null default 1,
  price numeric,
  wholesale_price numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_catalogs_updated_at
  before update on catalogs
  for each row execute function set_updated_at();

create table catalog_items (
  id bigint generated always as identity primary key,
  catalog_id bigint not null references catalogs(id) on delete cascade,
  product_id bigint not null references products(id) on delete cascade,
  image_url text
);

alter table categories enable row level security;
alter table size_types enable row level security;
alter table sizes enable row level security;
alter table products enable row level security;
alter table product_variants enable row level security;
alter table product_wholesale_prices enable row level security;
alter table price_overrides enable row level security;
alter table catalogs enable row level security;
alter table catalog_items enable row level security;

create policy "categories_all" on categories for all using (true) with check (true);
create policy "size_types_all" on size_types for all using (true) with check (true);
create policy "sizes_all" on sizes for all using (true) with check (true);
create policy "products_all" on products for all using (true) with check (true);
create policy "product_variants_all" on product_variants for all using (true) with check (true);
create policy "product_wholesale_prices_all" on product_wholesale_prices for all using (true) with check (true);
create policy "price_overrides_all" on price_overrides for all using (true) with check (true);
create policy "catalogs_all" on catalogs for all using (true) with check (true);
create policy "catalog_items_all" on catalog_items for all using (true) with check (true);
