-- Sistema de comisiones multinivel por entrega (pedido explicito del usuario 2026-07-21) --
-- REEMPLAZA al sistema viejo de comisiones por porcentaje (pay_referral_commissions via
-- loyalty_tiers.depth_commission_schedule, ver 009_rpcs.sql) por montos fijos en COP por nivel,
-- con requisito de actividad mensual y ventana de 90 dias. Decision explicita del usuario:
-- reemplaza, no corre en paralelo -- evita pagar doble comision por el mismo evento.

-- No existia una marca de tiempo estable de "cuando se entrego" -- solo updated_at generico,
-- que cualquier UPDATE posterior pisa. Necesario para el filtro "entregas de este mes".
alter table orders add column if not exists delivered_at timestamptz;

-- Montos fijos por nivel (editable con un UPDATE simple, sin migracion nueva).
create table if not exists referral_commission_levels (
  depth int primary key,
  amount_cop numeric not null
);
insert into referral_commission_levels (depth, amount_cop) values
  (1, 500), (2, 400), (3, 300), (4, 200), (5, 100)
on conflict (depth) do update set amount_cop = excluded.amount_cop;

-- Umbrales del plan (minimo de entregas mensuales para activar el pago a un upline, ventana de
-- dias desde el registro del vendedor durante la que pagan los 5 niveles) -- fila unica, mismo
-- motivo: ajustable sin tocar codigo.
create table if not exists referral_commission_config (
  id int primary key default 1,
  min_deliveries_per_month int not null default 2,
  activity_window_days int not null default 90,
  constraint referral_commission_config_single_row check (id = 1)
);
insert into referral_commission_config (id) values (1) on conflict (id) do nothing;

-- Escala (10k+ vendedores, 100k+ guias/mes segun el usuario): el recorrido de la cadena
-- (profiles.referrer_id) y el chequeo de actividad (hasta 5 consultas por evento de comision)
-- necesitan estos indices para no degradar con volumen.
create index if not exists idx_profiles_referrer_id on profiles(referrer_id);
create index if not exists idx_orders_seller_status_delivered on orders(seller_id, status, delivered_at);
