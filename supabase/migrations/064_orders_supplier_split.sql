-- Fase 2 del plan de aislamiento proveedor<->vendedor (pedido explicito del usuario 2026-07-20,
-- ver C:\Users\MOINS\.claude\plans\clever-hugging-shore.md): un pedido debe pertenecer a UN SOLO
-- proveedor, porque una guia de Mipaquete solo admite un remitente/direccion de recogida (Fase 3
-- va a cambiar de donde sale esa direccion, del proveedor en vez del vendedor). Hoy un pedido puede
-- mezclar productos de varios proveedores (confirmado: pay_supplier_commissions ya reparte
-- comisiones entre "TODOS los proveedores representados en el pedido") -- de aca en adelante el
-- checkout (TypeScript, lib/ordenes.ts) agrupa el carrito por proveedor ANTES de llamar create_order,
-- una vez por grupo. Este RPC calcula supplier_id el mismo a partir de los productos reales de cada
-- llamada (nunca confia en lo que mande el cliente) y rechaza si por error llegan mezclados.

alter table orders add column if not exists supplier_id uuid references profiles(id);

create or replace function create_order(order_data jsonb, items jsonb)
returns bigint as $$
declare
  v_order_id bigint;
  v_item jsonb;
  v_qty_total int := 0;
  v_price_total numeric := 0;
  v_supplier_id uuid;
  v_supplier_count int;
begin
  select count(distinct p.owner_profile_id), min(p.owner_profile_id)
    into v_supplier_count, v_supplier_id
  from products p
  where p.id in (select (elem->>'product_id')::bigint from jsonb_array_elements(items) elem);

  if v_supplier_count > 1 then
    raise exception 'pedido_multiples_proveedores';
  end if;

  insert into orders (seller_id, supplier_id, buyer_name, buyer_phone, buyer_address, buyer_city, buyer_neighborhood, order_type, freight_payer)
  values (
    (order_data->>'seller_id')::uuid,
    v_supplier_id,
    order_data->>'buyer_name',
    order_data->>'buyer_phone',
    order_data->>'buyer_address',
    order_data->>'buyer_city',
    order_data->>'buyer_neighborhood',
    coalesce(order_data->>'order_type', 'contraentrega'),
    order_data->>'freight_payer'
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(items)
  loop
    if (v_item->>'product_variant_id') is not null then
      perform decrement_variant_stock((v_item->>'product_variant_id')::bigint, (v_item->>'quantity')::int);
    end if;

    insert into order_items (order_id, product_id, product_variant_id, title, unit_price, quantity, size, color, commission_pct, seller_cost, total_cost)
    values (
      v_order_id,
      (v_item->>'product_id')::bigint,
      (v_item->>'product_variant_id')::bigint,
      v_item->>'title',
      (v_item->>'unit_price')::numeric,
      (v_item->>'quantity')::int,
      v_item->>'size',
      v_item->>'color',
      (v_item->>'commission_pct')::numeric,
      (v_item->>'seller_cost')::numeric,
      (v_item->>'total_cost')::numeric
    );

    v_qty_total := v_qty_total + (v_item->>'quantity')::int;
    v_price_total := v_price_total + ((v_item->>'unit_price')::numeric * (v_item->>'quantity')::int);
  end loop;

  update orders set quantity_total = v_qty_total, price_total = v_price_total where id = v_order_id;

  return v_order_id;
end;
$$ language plpgsql;
