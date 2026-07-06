-- Hito 8: back-office varios

create table banks (
  id bigint generated always as identity primary key,
  profile_id uuid references profiles(id),
  bank_name text not null,
  account_number text,
  account_type text,
  id_number text,
  account_holder_name text
);

alter table supplier_payouts add constraint supplier_payouts_bank_fk foreign key (bank_id) references banks(id);

create table testimonials (
  id bigint generated always as identity primary key,
  profile_id uuid references profiles(id),
  description text not null,
  status int not null default 1,
  created_at timestamptz not null default now()
);

create table courses (
  id bigint generated always as identity primary key,
  title text not null,
  video_url text,
  sort_order int not null default 0,
  image_url text,
  parent_id bigint references courses(id),
  description text
);

create table notifications (
  id bigint generated always as identity primary key,
  title text not null,
  image_url text,
  type int not null default 0, -- 0 ventas, 1 retiros, 2 mensaje de nivel
  is_admin boolean not null default false,
  description text,
  order_id bigint references orders(id),
  profile_id uuid references profiles(id),
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table site_config (
  id bigint generated always as identity primary key,
  banners jsonb not null default '[]'::jsonb,
  info_text jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into site_config (banners, info_text) values ('[]', '{}');

create trigger trg_site_config_updated_at
  before update on site_config
  for each row execute function set_updated_at();

create table onboarding_requests (
  id bigint generated always as identity primary key,
  profile_id uuid references profiles(id),
  warehouse_name text,
  categories jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table banks enable row level security;
alter table testimonials enable row level security;
alter table courses enable row level security;
alter table notifications enable row level security;
alter table site_config enable row level security;
alter table onboarding_requests enable row level security;

create policy "banks_all" on banks for all using (true) with check (true);
create policy "testimonials_all" on testimonials for all using (true) with check (true);
create policy "courses_all" on courses for all using (true) with check (true);
create policy "notifications_all" on notifications for all using (true) with check (true);
create policy "site_config_all" on site_config for all using (true) with check (true);
create policy "onboarding_requests_all" on onboarding_requests for all using (true) with check (true);
