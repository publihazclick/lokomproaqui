-- Hito 7: envíos (Mipaquete reemplaza los 4 transportadores viejos)

create table departments (
  id bigint generated always as identity primary key,
  name text not null unique
);

create table neighborhoods (
  id bigint generated always as identity primary key,
  name text not null,
  department_id bigint references departments(id)
);

create table pickup_addresses (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles(id),
  first_name text,
  last_name text,
  id_document text,
  whatsapp text,
  address text,
  email text,
  created_at timestamptz not null default now()
);

create table shipment_settlement_logs (
  id bigint generated always as identity primary key,
  order_id bigint not null references orders(id),
  profile_id uuid references profiles(id),
  data jsonb not null default '{}'::jsonb,
  status int not null default 1,
  created_at timestamptz not null default now()
);

alter table departments enable row level security;
alter table neighborhoods enable row level security;
alter table pickup_addresses enable row level security;
alter table shipment_settlement_logs enable row level security;

create policy "departments_all" on departments for all using (true) with check (true);
create policy "neighborhoods_all" on neighborhoods for all using (true) with check (true);
create policy "pickup_addresses_all" on pickup_addresses for all using (true) with check (true);
create policy "shipment_settlement_logs_all" on shipment_settlement_logs for all using (true) with check (true);
