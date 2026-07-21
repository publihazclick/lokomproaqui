-- Sistema de comisiones multinivel por entrega (pedido explicito del usuario 2026-07-21).
-- Reemplaza la funcion vieja pay_referral_commissions (009_rpcs.sql, pagaba % de
-- orders.earnings_total segun loyalty_tiers.depth_commission_schedule) -- MISMO NOMBRE, se sigue
-- llamando igual desde approve_order, cero cambios en quien la invoca (el cron
-- mipaquete-sync-tracking -> approve_order -> pay_referral_commissions).
--
-- Reglas del plan (confirmadas con el usuario):
-- - Monto fijo por nivel (referral_commission_levels), no porcentaje.
-- - "El invitado debe tener minimo 2 entregas exitosas en ese mes" se evalua POR ESLABON, de
--   forma independiente: para que el nivel 1 (referente directo) cobre, el VENDEDOR necesita
--   min_deliveries_per_month pedidos entregados este mes calendario. Para que el nivel 2 cobre,
--   la persona del nivel 1 necesita esa misma cantidad de entregas COMO VENDEDORA ella misma
--   este mes. Asi sucesivamente. Se evalua en tiempo real en cada entrega (no retroactivo).
-- - "90 dias desde que el invitado se registro" = 90 dias desde el registro del VENDEDOR que
--   genero la venta (profiles.created_at). Dentro de esa ventana pagan los 5 niveles (si pasan
--   el filtro de actividad); despues, solo el nivel 1 sigue pagando, indefinidamente.
-- - Cadena incompleta: si el vendedor tiene menos de 5 ancestros reales, solo se paga hasta
--   donde llegue la cadena real (el loop corta solo al no encontrar mas referrer_id).
-- - Guarda anti-ciclos (v_visited) heredada de la version vieja, por si algun dato corrupto
--   forma un ciclo en referrer_id.

create or replace function pay_referral_commissions(p_order_id bigint)
returns void as $$
declare
  v_seller_id uuid;
  v_seller_created_at timestamptz;
  v_current_id uuid;      -- el "invitado" del eslabon actual (empieza en el vendedor)
  v_referrer_id uuid;     -- el upline que cobraria en este eslabon
  v_min_deliveries int;
  v_window_days int;
  v_deliveries_count int;
  v_amount numeric;
  v_visited uuid[] := array[]::uuid[];
  v_depth int;
begin
  select o.seller_id, p.created_at into v_seller_id, v_seller_created_at
  from orders o
  join profiles p on p.id = o.seller_id
  where o.id = p_order_id;

  if v_seller_id is null then
    return;
  end if;

  select min_deliveries_per_month, activity_window_days into v_min_deliveries, v_window_days
  from referral_commission_config where id = 1;

  v_current_id := v_seller_id;

  for v_depth in 1..5 loop
    select referrer_id into v_referrer_id from profiles where id = v_current_id;
    exit when v_referrer_id is null;                       -- cadena incompleta, no hay mas arriba
    exit when v_referrer_id = any(v_visited);               -- anti-ciclo
    v_visited := array_append(v_visited, v_referrer_id);

    -- Del nivel 2 en adelante, solo pagan dentro de los primeros activity_window_days desde el
    -- registro del vendedor. El nivel 1 nunca tiene este limite.
    if v_depth > 1 and (now() - v_seller_created_at) > (v_window_days || ' days')::interval then
      exit;
    end if;

    -- Requisito de actividad de ESTE eslabon: v_current_id (el invitado de este nivel) necesita
    -- el minimo de entregas propias este mes calendario para que v_referrer_id cobre aca.
    select count(*) into v_deliveries_count
    from orders
    where seller_id = v_current_id
      and status = 'success'
      and delivered_at >= date_trunc('month', now());

    if v_deliveries_count >= v_min_deliveries then
      select amount_cop into v_amount from referral_commission_levels where depth = v_depth;
      if v_amount is not null and v_amount > 0 then
        perform credit_wallet(v_referrer_id, 'referral', v_amount, p_order_id, null, 'comision_nivel_' || v_depth);
      end if;
    end if;

    v_current_id := v_referrer_id;
  end loop;
end;
$$ language plpgsql;

-- approve_order: agrega delivered_at = now() en el mismo UPDATE que ya pone status='success' --
-- misma firma, mismos llamadores (cron de tracking), sin cambios de comportamiento salvo esta
-- columna nueva.
create or replace function approve_order(p_order_id bigint)
returns void as $$
declare
  v_already_paid boolean;
  v_order_type text;
  v_seller_id uuid;
  v_freight numeric;
begin
  select commission_paid, order_type, seller_id, freight_value
    into v_already_paid, v_order_type, v_seller_id, v_freight
    from orders where id = p_order_id;
  if v_already_paid then
    return;
  end if;

  if v_order_type in ('dropshipping', 'muestra') then
    update orders set status = 'success', commission_paid = true, delivered_at = now() where id = p_order_id;
    if v_seller_id is not null and v_freight is not null and v_freight > 0 then
      perform credit_wallet(v_seller_id, 'dropshipper', v_freight, p_order_id, null);
    end if;
    return;
  end if;

  update orders set status = 'success', commission_paid = true, delivered_at = now() where id = p_order_id;

  perform pay_referral_commissions(p_order_id);
  perform pay_supplier_commissions(p_order_id);
end;
$$ language plpgsql;
