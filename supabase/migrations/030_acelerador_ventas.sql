-- Curso pago "Acelerador de Ventas": suscripcion mensual rodante (30 dias desde el pago,
-- acumulable si renueva antes de vencer), acceso calculado al vuelo (sin cron/estado que
-- "voltear" en segundo plano) via acelerador_has_access. Los videos viven en un bucket PRIVADO
-- (acelerador-videos, creado aparte via Management API igual que lokomproaqui-media): a
-- diferencia del resto del proyecto (RLS USING(true) en todas partes), aqui SI importa la
-- politica real de Storage, porque es la unica barrera real contra descargas sin suscripcion
-- vigente (ver supabase/functions/acelerador-signed-url, que es quien de verdad la hace cumplir).

create table acelerador_modules (
  id bigint generated always as identity primary key,
  title text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table acelerador_lessons (
  id bigint generated always as identity primary key,
  module_id bigint not null references acelerador_modules(id) on delete cascade,
  title text not null,
  description text,
  sort_order int not null default 0,
  video_path text not null, -- ruta dentro del bucket privado `acelerador-videos`, nunca una URL
  thumbnail_url text, -- bucket publico lokomproaqui-media, no es sensible (vitrina de venta)
  duration_seconds int,
  created_at timestamptz not null default now()
);

create table acelerador_subscriptions (
  id bigint generated always as identity primary key,
  profile_id uuid not null unique references profiles(id),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_acelerador_subscriptions_updated_at
  before update on acelerador_subscriptions
  for each row execute function set_updated_at();

-- Mismo shape que wallet_topups: `code` unico para que el webhook siempre resuelva 1 sola fila.
create table acelerador_payments (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles(id),
  amount numeric not null,
  code text not null unique,
  status int not null default 0, -- 0 pendiente, 1 rechazado, 2 pagado
  epayco_transaction_id text,
  created_at timestamptz not null default now()
);

alter table acelerador_modules enable row level security;
alter table acelerador_lessons enable row level security;
alter table acelerador_subscriptions enable row level security;
alter table acelerador_payments enable row level security;

create policy "acelerador_modules_all" on acelerador_modules for all using (true) with check (true);
create policy "acelerador_lessons_all" on acelerador_lessons for all using (true) with check (true);
create policy "acelerador_subscriptions_all" on acelerador_subscriptions for all using (true) with check (true);
create policy "acelerador_payments_all" on acelerador_payments for all using (true) with check (true);

-- Fuente unica de verdad de acceso (se llama desde Angular y desde la Edge Function). Sin cron:
-- un vencimiento se detecta en el instante en que alguien pregunta, no en una corrida de fondo.
create or replace function acelerador_has_access(p_profile_id uuid)
returns boolean as $$
  select coalesce(
    (select current_period_end > now() from acelerador_subscriptions where profile_id = p_profile_id),
    false
  );
$$ language sql stable;

-- Extiende (o inicia) la suscripcion de forma atomica. Renovar antes de vencer suma dias sobre
-- lo que quedaba (no se pierden dias); renovar tarde arranca de nuevo desde `now()`. Se llama
-- desde el webhook en vez de hacer un select+update desde Deno, para no tener condicion de
-- carrera si ePayco reintenta el mismo webhook.
create or replace function acelerador_extend_subscription(p_profile_id uuid, p_days int default 30)
returns timestamptz as $$
declare
  v_new timestamptz;
begin
  insert into acelerador_subscriptions (profile_id, current_period_end)
  values (p_profile_id, now() + (p_days || ' days')::interval)
  on conflict (profile_id) do update
    set current_period_end = greatest(acelerador_subscriptions.current_period_end, now()) + (p_days || ' days')::interval
  returning current_period_end into v_new;
  return v_new;
end;
$$ language plpgsql;

-- Politicas del bucket privado `acelerador-videos` (el bucket en si se crea aparte via
-- Management API con public=false, igual que se hizo con lokomproaqui-media). A proposito NO
-- hay politica de select: RLS habilitado sin politica de select deniega por defecto a
-- anon/authenticated, solo el service_role (usado por acelerador-signed-url) puede leer/firmar
-- URLs. insert/update/delete si quedan abiertos a cualquier usuario logueado (no solo admin),
-- consistente con que ninguna pantalla de /config de este proyecto restringe por rol hoy.
create policy "acelerador_videos_insert" on storage.objects for insert
  with check (bucket_id = 'acelerador-videos' and auth.role() = 'authenticated');

create policy "acelerador_videos_update" on storage.objects for update
  using (bucket_id = 'acelerador-videos' and auth.role() = 'authenticated');

create policy "acelerador_videos_delete" on storage.objects for delete
  using (bucket_id = 'acelerador-videos' and auth.role() = 'authenticated');
