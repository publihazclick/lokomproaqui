-- Fase 1d del plan de reduccion de devoluciones: cron cada 30 min que llama a
-- whatsapp-confirmation-followup (recordatorio a las 12h sin respuesta, cancelacion automatica a
-- las 24h) -- mismo patron que sync-mipaquete-tracking (migracion 029). Publica (--no-verify-jwt)
-- porque la llama el cron internamente, sin usuario de por medio.

select cron.schedule(
  'whatsapp-confirmation-followup',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://enajheqrfbglcpsqglnb.supabase.co/functions/v1/whatsapp-confirmation-followup',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
