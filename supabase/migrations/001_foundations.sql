-- Hito 0: identidad base (roles, perfiles, niveles de lealtad, tiers de vendedor, grupos)

create extension if not exists "pgcrypto";

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Roles fijos (reemplaza la creación dinámica desde texto libre del sistema viejo)
create table roles (
  id bigint generated always as identity primary key,
  name text not null unique
);

insert into roles (name) values ('admin'), ('vendedor'), ('proveedor'), ('bodega');

-- Niveles de lealtad / MLM (reemplaza Categorias)
create table loyalty_tiers (
  id bigint generated always as identity primary key,
  name text not null unique,
  min_referrals int not null default 0,
  withdrawal_min_amount numeric not null default 0,
  max_depth int not null default 5,
  depth_commission_schedule jsonb not null default '[]'::jsonb, -- [{"depth":1,"pct":10}, {"depth":2,"pct":5}, ...]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_loyalty_tiers_updated_at
  before update on loyalty_tiers
  for each row execute function set_updated_at();

insert into loyalty_tiers (name, min_referrals, withdrawal_min_amount, max_depth, depth_commission_schedule) values
  ('bronce', 0, 20000, 3, '[{"depth":1,"pct":10},{"depth":2,"pct":3},{"depth":3,"pct":1}]'),
  ('plata', 5, 20000, 4, '[{"depth":1,"pct":10},{"depth":2,"pct":5},{"depth":3,"pct":2},{"depth":4,"pct":1}]'),
  ('oro', 15, 20000, 5, '[{"depth":1,"pct":12},{"depth":2,"pct":6},{"depth":3,"pct":3},{"depth":4,"pct":1.5},{"depth":5,"pct":1}]');

-- Tiers de vendedor / markup (reemplaza Tblcategoriaperfil)
create table seller_tiers (
  id bigint generated always as identity primary key,
  name text not null unique,
  markup_pct numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_seller_tiers_updated_at
  before update on seller_tiers
  for each row execute function set_updated_at();

insert into seller_tiers (name, markup_pct) values ('estandar', 0), ('mayorista', -10), ('preferencial', -5);

-- Grupos (reemplaza Empresa: etiqueta suelta, sin scoping real)
create table groups (
  id bigint generated always as identity primary key,
  name text not null,
  owner_profile_id uuid, -- FK a profiles agregada en la migración de auth (evita dependencia circular)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_groups_updated_at
  before update on groups
  for each row execute function set_updated_at();

alter table roles enable row level security;
alter table loyalty_tiers enable row level security;
alter table seller_tiers enable row level security;
alter table groups enable row level security;

create policy "roles_all" on roles for all using (true) with check (true);
create policy "loyalty_tiers_all" on loyalty_tiers for all using (true) with check (true);
create policy "seller_tiers_all" on seller_tiers for all using (true) with check (true);
create policy "groups_all" on groups for all using (true) with check (true);
