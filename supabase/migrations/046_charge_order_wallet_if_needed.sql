-- Cierra el hueco real encontrado 2026-07-19: reintentar "Autorizar Despacho" despues de que
-- fallara la generacion de la guia (Mipaquete con un error transitorio, timeout, rate limit, etc)
-- volvia a ejecutar TODO el flujo desde cero, incluido el debito de la wallet -- sin ningun
-- chequeo de "esto ya se cobro". La guia en si nunca se duplicaba (mipaquete-create-shipment ya
-- tiene su propio guard: 409 si order.mipaquete_shipment_id ya existe), pero la plata si podia
-- cobrarse dos veces por una sola guia real. Mismo riesgo con doble-clic muy rapido o el mismo
-- pedido abierto en dos pestañas (cada una con su propio estado de React, sin coordinacion entre
-- si). DropshippingCheckoutModal ya tenia un diseño correcto para esto (reintentarGuia() separado
-- que nunca vuelve a debitar + cancelarYReembolsar() explicito) pero FormVentaDetalleModal
-- (Autorizar Despacho) no lo tenia.
--
-- Fix de raiz: un solo RPC atomico que bloquea la fila del pedido (FOR UPDATE) y solo debita si
-- todavia no se habia debitado -- funciona igual sin importar si la causa es un reintento, un
-- doble-clic, o dos pestañas abiertas del mismo pedido.
--
-- order_wallet_debited es una columna NUEVA, separada a proposito de freight_wallet_funded
-- (migracion 045): freight_wallet_funded sigue significando "el flete especificamente salio de la
-- wallet" (lo que approve_order/reject_order usan para decidir si hay que devolverlo).
-- order_wallet_debited solo significa "ya se ejecuto el cobro de autorizacion para este pedido,
-- sea lo que sea que haya incluido". Son la misma cosa casi siempre, pero difieren en el unico
-- caso real: dropshipping con "cliente ya pago" + "envio aparte", donde SI se cobra seguro y/o
-- producto de la wallet pero el flete especificamente NO -- ahi freight_wallet_funded queda en
-- false (correcto para el reembolso) pero order_wallet_debited igual debe quedar en true (para
-- que un reintento no vuelva a cobrar el seguro/producto).

ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_wallet_debited boolean NOT NULL DEFAULT false;

-- Backfill: cualquier pedido que ya tenga el flete marcado como pagado por wallet, ya paso por
-- este punto en el pasado (no hay guias reales en produccion todavia, es solo consistencia de datos).
UPDATE orders SET order_wallet_debited = true WHERE freight_wallet_funded = true;

CREATE OR REPLACE FUNCTION public.charge_order_wallet_if_needed(
  p_order_id bigint,
  p_profile_id uuid,
  p_amount numeric,
  p_kind text,
  p_freight_funded boolean
) RETURNS boolean
 LANGUAGE plpgsql
AS $function$
declare
  v_already boolean;
begin
  select order_wallet_debited into v_already from orders where id = p_order_id for update;
  if v_already is null then
    raise exception 'pedido_no_encontrado';
  end if;
  if v_already then
    return false;
  end if;

  if p_amount is not null and p_amount > 0 then
    perform debit_wallet(p_profile_id, 'dropshipper', p_amount, p_order_id, p_kind);
  end if;

  update orders set order_wallet_debited = true, freight_wallet_funded = p_freight_funded where id = p_order_id;
  return true;
end;
$function$;
