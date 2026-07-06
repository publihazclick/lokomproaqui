-- Bug encontrado en Hito 5: create_order nunca calculaba earnings_total (la ganancia base
-- del vendedor sobre la que se pagan las comisiones de referidos). Se calcula como
-- price_total * profiles.commission_pct / 100 del vendedor del pedido.

create or replace function create_order(order_data jsonb, items jsonb)
returns bigint as $$
declare
  v_order_id bigint;
  v_item jsonb;
  v_qty_total int := 0;
  v_price_total numeric := 0;
  v_seller_id uuid;
  v_commission_pct numeric;
  v_earnings numeric := 0;
begin
  v_seller_id := (order_data->>'seller_id')::uuid;

  insert into orders (seller_id, buyer_name, buyer_phone, buyer_address, buyer_city, buyer_neighborhood, order_type, freight_payer)
  values (
    v_seller_id,
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

  if v_seller_id is not null then
    select commission_pct into v_commission_pct from profiles where id = v_seller_id;
    v_earnings := round(v_price_total * coalesce(v_commission_pct, 0) / 100, 2);
  end if;

  update orders set quantity_total = v_qty_total, price_total = v_price_total, earnings_total = v_earnings where id = v_order_id;

  return v_order_id;
end;
$$ language plpgsql;
