-- Hito 5/6: billetera de comisiones, recargas y retiros

create type wallet_type as enum ('referral', 'supplier');

create table wallet_balances (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles(id),
  wallet_type wallet_type not null,
  balance numeric not null default 0,
  unique (profile_id, wallet_type)
);

create table wallet_ledger (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles(id),
  wallet_type wallet_type not null,
  order_id bigint references orders(id),
  amount numeric not null,
  previous_balance numeric not null,
  new_balance numeric not null,
  pct numeric,
  direction int not null, -- 0 entrada, 1 salida
  status int not null default 1,
  created_at timestamptz not null default now()
);

create index idx_wallet_ledger_profile on wallet_ledger(profile_id);

create table recharge_products (
  id bigint generated always as identity primary key,
  title text not null,
  description text,
  status int not null default 1,
  image_url text,
  price numeric not null
);

create table recharge_purchases (
  id bigint generated always as identity primary key,
  recharge_product_id bigint not null references recharge_products(id),
  profile_id uuid not null references profiles(id),
  status int not null default 0, -- 0 activo, 1 eliminado, 2 pagado
  amount numeric not null,
  code text,
  epayco_transaction_id text,
  created_at timestamptz not null default now()
);

create table withdrawal_requests (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles(id),
  id_document text,
  phone text,
  bank_account_number text,
  bank_name text,
  amount numeric not null,
  method text,
  status int not null default 0, -- 0 activo, 1 aprobado, 2 rechazado, 3 eliminado
  freight_deduction numeric default 0,
  returns_deduction numeric default 0,
  net_amount numeric,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table wallet_balances enable row level security;
alter table wallet_ledger enable row level security;
alter table recharge_products enable row level security;
alter table recharge_purchases enable row level security;
alter table withdrawal_requests enable row level security;

create policy "wallet_balances_all" on wallet_balances for all using (true) with check (true);
create policy "wallet_ledger_all" on wallet_ledger for all using (true) with check (true);
create policy "recharge_products_all" on recharge_products for all using (true) with check (true);
create policy "recharge_purchases_all" on recharge_purchases for all using (true) with check (true);
create policy "withdrawal_requests_all" on withdrawal_requests for all using (true) with check (true);
