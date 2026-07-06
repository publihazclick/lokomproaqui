-- Hito 0/1: perfiles ligados a Supabase Auth (reemplaza Tblusuario)

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  referrer_id uuid references profiles(id),
  role_id bigint not null references roles(id) default 2, -- vendedor por defecto
  loyalty_tier_id bigint references loyalty_tiers(id) default 1, -- bronce por defecto
  seller_tier_id bigint references seller_tiers(id) default 1,
  group_id bigint references groups(id),
  commission_pct numeric not null default 10,
  supplier_commission_pct numeric not null default 2.5,
  withdrawal_enabled boolean not null default true,
  referral_code text unique,
  full_name text,
  last_name text,
  phone text unique,
  document_id text,
  city text,
  address text,
  avatar_url text,
  banner_url text,
  supplier_doc_rut_url text,
  supplier_doc_cc_url text,
  supplier_doc_comercio_url text,
  status int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table groups add constraint groups_owner_fk foreign key (owner_profile_id) references profiles(id);

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

create table user_categories (
  profile_id uuid not null references profiles(id) on delete cascade,
  category_id bigint not null, -- FK a categories agregada en 003_catalog.sql
  primary key (profile_id, category_id)
);

-- Genera un código de referido corto y único
create or replace function generate_referral_code()
returns text as $$
declare
  code text;
begin
  loop
    code := upper(substr(md5(random()::text), 1, 6));
    exit when not exists (select 1 from profiles where referral_code = code);
  end loop;
  return code;
end;
$$ language plpgsql;

-- Trigger: crea el perfil automáticamente al registrarse en Supabase Auth
create or replace function handle_new_user()
returns trigger as $$
declare
  ref_id uuid;
begin
  if new.raw_user_meta_data ->> 'referral_code' is not null then
    select id into ref_id from profiles where referral_code = new.raw_user_meta_data ->> 'referral_code';
  end if;

  insert into profiles (id, referrer_id, full_name, last_name, phone, referral_code)
  values (
    new.id,
    ref_id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'phone',
    generate_referral_code()
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Permite login con celular: el frontend resuelve el email antes de signInWithPassword
create or replace function lookup_email_by_phone(p_phone text)
returns text as $$
  select u.email from auth.users u
  join profiles p on p.id = u.id
  where p.phone = p_phone
  limit 1;
$$ language sql security definer set search_path = public;

alter table profiles enable row level security;
alter table user_categories enable row level security;

create policy "profiles_all" on profiles for all using (true) with check (true);
create policy "user_categories_all" on user_categories for all using (true) with check (true);
