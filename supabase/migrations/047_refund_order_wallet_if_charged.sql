-- Bug real encontrado 2026-07-19 (mismo hilo del punto "pedidos cancelados antes de tener guia"):
-- DropshippingCheckoutModal.cancelarYReembolsar() reembolsaba `totalAPagar` a la wallet de forma
-- INCONDICIONAL, sin verificar si esa plata alguna vez salio realmente de la wallet. El boton
-- "Cancelar pedido" aparece cada vez que `error` esta activo (con fleteSeleccionado ya elegido) Y
-- `mostrarRecarga` esta en false -- eso incluye el caso en que el debito real fallo (ej.
-- charge_order_wallet_if_needed lanzo saldo_insuficiente por una condicion de carrera con el saldo
-- ya mostrado en pantalla, o cualquier otro error transitorio de red/RPC) sin haber cobrado nada.
-- En ese estado, el vendedor podia darle "Cancelar pedido" y recibir totalAPagar gratis en su
-- wallet sin haber pagado un peso.
--
-- Fix de raiz, mismo patron que charge_order_wallet_if_needed (migracion 046): un RPC atomico que
-- bloquea la fila del pedido, revisa si order_wallet_debited es realmente true, y solo entonces
-- calcula el monto EXACTO ya cobrado (sumando los debitos reales en wallet_ledger, nunca confiando
-- en un monto que mande el cliente) y lo devuelve -- si nunca se cobro nada, es un no-op seguro.

CREATE OR REPLACE FUNCTION public.refund_order_wallet_if_charged(p_order_id bigint)
RETURNS boolean
 LANGUAGE plpgsql
AS $function$
declare
  v_already boolean;
  v_seller_id uuid;
  v_amount numeric;
begin
  select order_wallet_debited, seller_id into v_already, v_seller_id from orders where id = p_order_id for update;
  if v_already is null then
    raise exception 'pedido_no_encontrado';
  end if;
  if not v_already then
    return false;
  end if;

  select coalesce(sum(-amount), 0) into v_amount
    from wallet_ledger
    where order_id = p_order_id and wallet_type = 'dropshipper' and direction = 1;

  if v_amount > 0 and v_seller_id is not null then
    perform credit_wallet(v_seller_id, 'dropshipper', v_amount, p_order_id, null, 'flete_cancelado');
  end if;

  update orders set order_wallet_debited = false, freight_wallet_funded = false where id = p_order_id;
  return true;
end;
$function$;
