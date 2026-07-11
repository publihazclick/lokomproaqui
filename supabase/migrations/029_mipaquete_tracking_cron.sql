-- Actualizacion automatica en segundo plano del estado real de las guias (pedido explicito del
-- usuario 2026-07-10: "actualizacion automatica en segundo plano (cron)", no solo bajo demanda).
-- Cada 30 minutos llama a la Edge Function mipaquete-sync-tracking, que consulta Mipaquete por
-- cada pedido con guia activa y guarda el estado real en orders.tracking_*. La funcion se
-- despliega publica (--no-verify-jwt, mismo patron que epayco-webhook) porque la llama el cron
-- internamente, sin usuario de por medio.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'sync-mipaquete-tracking',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://enajheqrfbglcpsqglnb.supabase.co/functions/v1/mipaquete-sync-tracking',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
