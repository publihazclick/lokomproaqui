-- Fase 2 del plan de aislamiento proveedor<->vendedor -- correccion sobre 064: encontrados 5 puntos
-- de llamada reales a create_order (checkout de carrito, Shopify resolver + webhook, WooCommerce
-- resolver + webhook), 2 de ellos Edge Functions en Deno donde no se puede reusar el helper de
-- TypeScript (lib/ordenes.ts). En vez de duplicar la logica de "agrupar por proveedor" en Deno y en
-- TypeScript, se mueve DENTRO del RPC -- unica fuente de verdad, y ademas atomica de verdad: si un
-- grupo falla (ej. sin stock), toda la funcion revierte (Postgres deshace automaticamente todo el
-- trabajo de una funcion que lanza una excepcion, incluidos los pedidos de otros grupos ya
-- insertados en ESA misma llamada) -- la version anterior (064, loop en TypeScript llamando el RPC
-- una vez por grupo) no tenia esa garantia entre llamadas separadas.
--
-- Cambia el tipo de retorno de bigint a bigint[] (un id por proveedor distinto representado en
-- items) -- rompe la firma para cualquier llamador que asuma un solo id, por eso hay que soltar la
-- funcion vieja primero (Postgres no permite CREATE OR REPLACE cuando cambia el tipo de retorno).

drop function if exists create_order(jsonb, jsonb);

create function create_order(order_data jsonb, items jsonb)
returns bigint[] as $$
declare
  v_order_id bigint;
  v_item jsonb;
  v_group record;
  v_qty_total int;
  v_price_total numeric;
  v_order_ids bigint[] := '{}';
  v_items_count int;
  v_matched_count int;
begin
  -- El join de abajo (para agrupar por owner_profile_id) descartaria en silencio cualquier item con
  -- un product_id que no exista -- antes eso fallaba fuerte con una violacion de FK al insertar en
  -- order_items. Se preserva ese fallo explicito en vez de perder items sin avisar.
  select jsonb_array_length(items) into v_items_count;
  select count(*) into v_matched_count from jsonb_array_elements(items) elem join products p on p.id = (elem->>'product_id')::bigint;
  if v_matched_count <> v_items_count then
    raise exception 'producto_invalido: uno o mas items no corresponden a un producto real';
  end if;

  for v_group in
    select p.owner_profile_id as owner_id, jsonb_agg(elem) as group_items
    from jsonb_array_elements(items) elem
    join products p on p.id = (elem->>'product_id')::bigint
    group by p.owner_profile_id
  loop
    v_qty_total := 0;
    v_price_total := 0;

    insert into orders (seller_id, supplier_id, buyer_name, buyer_phone, buyer_address, buyer_city, buyer_neighborhood, order_type, freight_payer)
    values (
      (order_data->>'seller_id')::uuid,
      v_group.owner_id,
      order_data->>'buyer_name',
      order_data->>'buyer_phone',
      order_data->>'buyer_address',
      order_data->>'buyer_city',
      order_data->>'buyer_neighborhood',
      coalesce(order_data->>'order_type', 'contraentrega'),
      order_data->>'freight_payer'
    )
    returning id into v_order_id;

    for v_item in select * from jsonb_array_elements(v_group.group_items)
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

    v_order_ids := array_append(v_order_ids, v_order_id);
  end loop;

  return v_order_ids;
end;
$$ language plpgsql;
