-- Monitor de uptime real (pedido explicito del usuario 2026-07-22, tras un incidente donde HTTPS
-- al dominio custom `lokomproaqui.com` dejo de responder mientras el DNS/certificado/deploy
-- estaban bien -- el usuario se entero por un cliente en vez de por una alerta). Cron cada 5 min
-- via pg_cron + pg_net (mismo patron que mipaquete-sync-tracking/whatsapp-confirmation-followup)
-- que llama a la Edge Function `uptime-check`, que chequea 2 objetivos por separado:
--   - 'dominio': https://lokomproaqui.com/info (lo que ve un usuario real)
--   - 'app': https://lokomproaqui-next.vercel.app/info (el deploy de Vercel sin pasar por el
--     dominio custom) -- distingue "se cayo el enrutamiento del dominio" (dominio caido, app viva,
--     exactamente lo que paso hoy) de "se cayo la app de verdad" (los dos caidos).
-- Alerta por email via Resend (RESEND_API_KEY/RESEND_FROM, mismo mecanismo que ChatVende/LiveCam
-- Pro) a UPTIME_ALERT_EMAIL -- no hay canal de WhatsApp servidor-a-servidor disponible todavia en
-- este proyecto (Meta Business Cloud API sigue "dormida", ver [[lokomproaqui_returns_plan_meta_whatsapp]]).

create table if not exists site_uptime_status (
  target text primary key,
  url text not null,
  is_up boolean not null default true,
  consecutive_failures int not null default 0,
  last_checked_at timestamptz,
  last_status_change_at timestamptz,
  last_alert_at timestamptz,
  last_error text
);

insert into site_uptime_status (target, url) values
  ('dominio', 'https://lokomproaqui.com/info'),
  ('app', 'https://lokomproaqui-next.vercel.app/info')
on conflict (target) do nothing;

alter table site_uptime_status enable row level security;
create policy "site_uptime_status_all" on site_uptime_status for all using (true) with check (true);

select cron.schedule(
  'uptime-check-lokomproaqui',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://enajheqrfbglcpsqglnb.supabase.co/functions/v1/uptime-check',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
