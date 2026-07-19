-- Fase 1 del plan de reduccion de devoluciones (pedido explicito del usuario 2026-07-19): scoring
-- de riesgo por comprador, CROSS-SELLER -- como la wallet ya es centralizada en toda la plataforma,
-- un comprador que ya devolvio pedidos con OTRO vendedor tambien queda marcado aca, no solo dentro
-- de la tienda de un vendedor especifico.
--
-- Se actualiza via un TRIGGER en orders (no dentro de approve_order/reject_order) a proposito: la
-- logica de dinero de esas dos funciones ya esta probada y estable, y esto es puramente informativo
-- -- separarlo reduce el riesgo de romper algo battle-tested. El trigger solo reacciona cuando
-- status realmente CAMBIA hacia 'success'/'rejected', asi que hereda gratis la misma idempotencia
-- que ya tienen approve_order (solo actualiza status en la primera llamada, commission_paid como
-- guardia) y reject_order (siempre pone 'rejected', pero si ya estaba en 'rejected' el UPDATE no
-- cambia el valor y el trigger no dispara de nuevo).

CREATE TABLE customer_risk_profile (
  phone_normalized text PRIMARY KEY,
  total_orders integer NOT NULL DEFAULT 0,
  total_returns integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customer_risk_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_risk_profile_all ON customer_risk_profile FOR ALL TO public USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_customer_risk_profile()
RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_phone text;
begin
  if NEW.status = OLD.status then
    return NEW;
  end if;
  if NEW.status not in ('success', 'rejected') then
    return NEW;
  end if;

  v_phone := regexp_replace(coalesce(NEW.buyer_phone, ''), '[^0-9]', '', 'g');
  if length(v_phone) < 10 then
    return NEW; -- telefono invalido/incompleto, no vale la pena trackear
  end if;
  v_phone := right(v_phone, 10); -- normaliza quitando el indicativo de pais (57) si vino incluido

  insert into customer_risk_profile (phone_normalized, total_orders, total_returns, updated_at)
  values (v_phone, 1, case when NEW.status = 'rejected' then 1 else 0 end, now())
  on conflict (phone_normalized) do update set
    total_orders = customer_risk_profile.total_orders + 1,
    total_returns = customer_risk_profile.total_returns + (case when NEW.status = 'rejected' then 1 else 0 end),
    updated_at = now();

  return NEW;
end;
$function$;

CREATE TRIGGER trg_update_customer_risk_profile
AFTER UPDATE OF status ON orders
FOR EACH ROW
EXECUTE FUNCTION public.update_customer_risk_profile();
