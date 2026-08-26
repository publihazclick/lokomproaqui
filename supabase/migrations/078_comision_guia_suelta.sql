-- Pedido explicito del usuario 2026-07-24: las "guias sueltas" (modulo Generacion de Guias,
-- envios sin pedido de tienda detras, ver 059_standalone_shipments.sql) tambien deben pagar
-- comision de referido cuando se entregan -- pero SOLO nivel 1 (el referente directo del
-- vendedor que genero la guia), monto fijo 500 COP, sin las reglas de actividad mensual/ventana
-- de 90 dias que si aplican al sistema de comisiones por venta (069_referral_commission_flat_payout.sql)
-- -- regla explicitamente mas simple, tal como se pidio.
--
-- Se reusa el mismo kind 'comision_nivel_1' (no uno nuevo tipo 'comision_guia_nivel_1') para que
-- esta comision aparezca automaticamente en el total de "Mis Referidos" del mes
-- (src/lib/referidos.ts:74, filtra wallet_ledger por `kind like 'comision_nivel_%'`) sin tener
-- que tocar ninguna consulta del frontend. order_id se manda null a proposito: wallet_ledger.order_id
-- tiene FK real a orders(id) (006_wallet.sql) y una guia suelta no es una fila de esa tabla.
--
-- Idempotencia: mismo patron que approve_order (commission_paid boolean, 069) -- si ya se pago,
-- una segunda llamada a deliver_standalone_shipment no vuelve a pagar.

alter table standalone_shipments add column if not exists commission_paid boolean not null default false;

create or replace function public.deliver_standalone_shipment(p_shipment_id bigint)
returns void
language plpgsql
as $function$
declare
  v_already_paid boolean;
  v_owner_id uuid;
  v_referrer_id uuid;
begin
  select commission_paid, profile_id into v_already_paid, v_owner_id
  from standalone_shipments where id = p_shipment_id;

  update standalone_shipments set status = 'delivered', commission_paid = true
    where id = p_shipment_id and status not in ('delivered', 'returned', 'cancelled');

  if coalesce(v_already_paid, true) = false and v_owner_id is not null then
    select referrer_id into v_referrer_id from profiles where id = v_owner_id;
    if v_referrer_id is not null then
      perform credit_wallet(v_referrer_id, 'referral', 500, null, null, 'comision_nivel_1');
    end if;
  end if;
end;
$function$;
