-- Modulo "Generacion de Guias" (pedido explicito del usuario 2026-07-20): guias de Mipaquete
-- sueltas, sin pedido de tienda detras -- cualquier vendedor puede cotizar y generar el envio de
-- un paquete propio, eligiendo contra_entrega/pago_anticipado, pagando el flete (ya con el margen
-- de $4.000 de MARGEN_LOKOMPROAQUI_COP, ver mipaquete-quote/index.ts) desde su wallet 'dropshipper'
-- -- mismo mecanismo ya vigente para pedidos (041_flete_siempre_prepagado.sql: el flete SIEMPRE
-- sale de la wallet antes de generar la guia, sin excepcion), y con la misma proteccion de seguro
-- antidevoluciones (040_seguro_contraentrega.sql) reusando fetchSeguroObligatorio del lado cliente.

CREATE TABLE standalone_shipments (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles(id),
  status text not null default 'draft'
    check (status in ('draft', 'quoted', 'generated', 'in_transit', 'delivered', 'returned', 'cancelled')),
  created_at timestamptz not null default now(),

  -- Tipo de pago del paquete (no del flete -- el flete siempre sale de la wallet, ver arriba):
  -- contra_entrega = el mensajero cobra collection_value al entregar; pago_anticipado = ya le
  -- pagaron al vendedor, el mensajero no cobra nada.
  payment_type text not null check (payment_type in ('contra_entrega', 'pago_anticipado')),
  collection_value numeric not null default 0,

  declared_value numeric,
  content_description text,
  weight numeric,
  width numeric,
  height numeric,
  length numeric,

  receiver_name text,
  receiver_phone text,
  receiver_address text,
  receiver_city text,
  receiver_neighborhood text,
  receiver_reference text,
  destino_dane_code text,

  delivery_company_id text,
  delivery_company_name text,
  freight_cost numeric, -- ya incluye MARGEN_LOKOMPROAQUI_COP, igual que orders.freight_value

  insurance_active boolean not null default false,
  insurance_forced boolean not null default false,
  insurance_cost numeric not null default 0,

  -- Guard idempotente, mismo patron que orders.order_wallet_debited (046_charge_order_wallet_if_needed.sql):
  -- evita cobrar dos veces el mismo flete/seguro si "Generar guia" se reintenta tras un error de
  -- Mipaquete, doble-clic, o dos pestañas abiertas.
  wallet_debited boolean not null default false,

  mipaquete_shipment_id text,
  tracking_number text,
  tracking_status text,
  tracking_synced_at timestamptz,
  return_reason return_reason
);

create index idx_standalone_shipments_profile on standalone_shipments(profile_id);
create index idx_standalone_shipments_status on standalone_shipments(status);

alter table standalone_shipments enable row level security;
-- Mismo criterio laxo ya usado en todo el esquema (wallet_balances_all, pickup_addresses_all,
-- etc.) -- este proyecto no aplica RLS granular por usuario, el control de acceso vive en la app.
create policy "standalone_shipments_all" on standalone_shipments for all using (true) with check (true);

-- Clon de charge_order_wallet_if_needed (046) sobre standalone_shipments.wallet_debited.
CREATE OR REPLACE FUNCTION public.charge_standalone_shipment_wallet_if_needed(
  p_shipment_id bigint,
  p_profile_id uuid,
  p_amount numeric,
  p_kind text
) RETURNS boolean
 LANGUAGE plpgsql
AS $function$
declare
  v_already boolean;
begin
  select wallet_debited into v_already from standalone_shipments where id = p_shipment_id for update;
  if v_already is null then
    raise exception 'guia_no_encontrada';
  end if;
  if v_already then
    return false;
  end if;

  if p_amount is not null and p_amount > 0 then
    perform debit_wallet(p_profile_id, 'dropshipper', p_amount, null, p_kind);
  end if;

  update standalone_shipments set wallet_debited = true where id = p_shipment_id;
  return true;
end;
$function$;

-- Clon de reject_order (040/042/043): si la guia tenia seguro activo, devuelve el flete (menos el
-- margen de LokomproAqui, igual formula que orders) a la wallet del vendedor. No-op si ya estaba
-- en un estado terminal (idempotente ante reprocesos del cron de tracking).
CREATE OR REPLACE FUNCTION public.reject_standalone_shipment(p_shipment_id bigint)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_profile_id uuid;
  v_freight numeric;
  v_insured boolean;
  v_prev_status text;
begin
  select profile_id, freight_cost, insurance_active, status
    into v_profile_id, v_freight, v_insured, v_prev_status
    from standalone_shipments where id = p_shipment_id for update;

  if v_prev_status is null or v_prev_status in ('returned', 'cancelled') then
    return;
  end if;

  update standalone_shipments set status = 'returned' where id = p_shipment_id;

  if v_insured and v_profile_id is not null and v_freight is not null and v_freight > 0 then
    perform credit_wallet(v_profile_id, 'dropshipper', greatest(v_freight - 4000, 0), null, null, 'flete_devuelto_seguro_guia');
  end if;
end;
$function$;

-- No paga comisiones (no hay cadena de referidos en una guia suelta, no es una venta de producto).
CREATE OR REPLACE FUNCTION public.deliver_standalone_shipment(p_shipment_id bigint)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  update standalone_shipments set status = 'delivered'
    where id = p_shipment_id and status not in ('delivered', 'returned', 'cancelled');
end;
$function$;
