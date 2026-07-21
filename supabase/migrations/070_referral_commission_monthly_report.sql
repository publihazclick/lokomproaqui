-- Reporte mensual de comisiones (pedido explicito del usuario 2026-07-21, item 3 del plan
-- original). Las comisiones ya se acreditan en tiempo real a wallet_ledger (mismo patron de
-- credit_wallet usado en toda la plataforma) -- esto NO es una cola de pagos pendientes, es un
-- snapshot/archivo de lo ya pagado por vendedor y mes, para reporteria rapida a escala (10k+
-- vendedores) sin tener que agregar wallet_ledger completo cada vez que alguien quiera ver un
-- mes historico.

create table if not exists referral_commission_monthly_summary (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles(id),
  period date not null,                 -- primer dia del mes, ej. 2026-07-01
  total_comision numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (profile_id, period)
);

create index if not exists idx_referral_commission_summary_period on referral_commission_monthly_summary(period);

create or replace function generar_reporte_mensual_comisiones(p_period date default date_trunc('month', now() - interval '1 month')::date)
returns void as $$
begin
  insert into referral_commission_monthly_summary (profile_id, period, total_comision)
  select profile_id, p_period, sum(amount)
  from wallet_ledger
  where wallet_type = 'referral'
    and kind like 'comision_nivel_%'
    and created_at >= p_period
    and created_at < (p_period + interval '1 month')
  group by profile_id
  on conflict (profile_id, period) do update set total_comision = excluded.total_comision;
end;
$$ language plpgsql;

-- Corre el dia 1 de cada mes a las 3am, archiva el mes que acaba de terminar. Mismo mecanismo
-- pg_cron ya usado en 029_mipaquete_tracking_cron.sql -- aca no hace falta net.http_post porque
-- todo el trabajo es SQL puro, sin llamar a ninguna API externa.
select cron.schedule(
  'reporte-mensual-comisiones-referidos',
  '0 3 1 * *',
  $$select generar_reporte_mensual_comisiones();$$
);
