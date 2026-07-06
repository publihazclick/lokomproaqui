-- RPCs transaccionales: checkout atómico y motor de comisiones

create or replace function decrement_variant_stock(p_variant_id bigint, p_qty int)
returns void as $$
begin
  update product_variants set stock = stock - p_qty
  where id = p_variant_id and stock >= p_qty;

  if not found then
    raise exception 'stock_insuficiente: variante % no tiene % unidades disponibles', p_variant_id, p_qty;
  end if;
end;
$$ language plpgsql;

-- Crea un pedido con sus items y descuenta stock, todo en una sola transacción.
-- order_data: {seller_id, buyer_name, buyer_phone, buyer_address, buyer_city, buyer_neighborhood, order_type, freight_payer}
-- items: [{product_id, product_variant_id, title, unit_price, quantity, size, color, commission_pct, seller_cost, total_cost}]
create or replace function create_order(order_data jsonb, items jsonb)
returns bigint as $$
declare
  v_order_id bigint;
  v_item jsonb;
  v_qty_total int := 0;
  v_price_total numeric := 0;
begin
  insert into orders (seller_id, buyer_name, buyer_phone, buyer_address, buyer_city, buyer_neighborhood, order_type, freight_payer)
  values (
    (order_data->>'seller_id')::uuid,
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

-- Registra un movimiento de billetera y actualiza el balance corriente, atómico.
create or replace function credit_wallet(p_profile_id uuid, p_wallet_type wallet_type, p_amount numeric, p_order_id bigint, p_pct numeric)
returns void as $$
declare
  v_prev numeric;
  v_new numeric;
begin
  insert into wallet_balances (profile_id, wallet_type, balance)
  values (p_profile_id, p_wallet_type, 0)
  on conflict (profile_id, wallet_type) do nothing;

  select balance into v_prev from wallet_balances where profile_id = p_profile_id and wallet_type = p_wallet_type for update;
  v_new := v_prev + p_amount;

  update wallet_balances set balance = v_new where profile_id = p_profile_id and wallet_type = p_wallet_type;

  insert into wallet_ledger (profile_id, wallet_type, order_id, amount, previous_balance, new_balance, pct, direction, status)
  values (p_profile_id, p_wallet_type, p_order_id, p_amount, v_prev, v_new, p_pct, 0, 1);
end;
$$ language plpgsql;

-- Sube por la cadena de referidos pagando a cada ancestro según SU PROPIO nivel de lealtad.
-- Corrige el bug del sistema viejo: tope duro + guarda contra ciclos (visited).
create or replace function pay_referral_commissions(p_order_id bigint)
returns void as $$
declare
  v_seller_id uuid;
  v_earnings numeric;
  v_current_id uuid;
  v_referrer_id uuid;
  v_depth int := 0;
  v_max_hard_cap int := 10;
  v_tier record;
  v_pct numeric;
  v_amount numeric;
  v_visited uuid[] := array[]::uuid[];
begin
  select seller_id, earnings_total into v_seller_id, v_earnings from orders where id = p_order_id;
  if v_seller_id is null or v_earnings is null or v_earnings <= 0 then
    return;
  end if;

  v_current_id := v_seller_id;

  loop
    v_depth := v_depth + 1;
    exit when v_depth > v_max_hard_cap;

    select referrer_id into v_referrer_id from profiles where id = v_current_id;
    exit when v_referrer_id is null;
    exit when v_referrer_id = any(v_visited); -- guarda contra ciclos

    v_visited := array_append(v_visited, v_referrer_id);

    select lt.* into v_tier
    from profiles p join loyalty_tiers lt on lt.id = p.loyalty_tier_id
    where p.id = v_referrer_id;

    exit when v_tier is null or v_depth > v_tier.max_depth;

    select (elem->>'pct')::numeric into v_pct
    from jsonb_array_elements(v_tier.depth_commission_schedule) elem
    where (elem->>'depth')::int = v_depth;

    if v_pct is not null and v_pct > 0 then
      v_amount := round(v_earnings * v_pct / 100, 2);
      perform credit_wallet(v_referrer_id, 'referral', v_amount, p_order_id, v_pct);
    end if;

    v_current_id := v_referrer_id;
  end loop;
end;
$$ language plpgsql;

-- Paga a TODOS los proveedores representados en el pedido (corrige el bug viejo de pagar solo al primero).
create or replace function pay_supplier_commissions(p_order_id bigint)
returns void as $$
declare
  v_row record;
begin
  for v_row in
    select p.owner_profile_id as supplier_id, sum(oi.total_cost) as total
    from order_items oi
    join products p on p.id = oi.product_id
    where oi.order_id = p_order_id and p.owner_profile_id is not null
    group by p.owner_profile_id
  loop
    perform credit_wallet(v_row.supplier_id, 'supplier', v_row.total, p_order_id, null);
  end loop;
end;
$$ language plpgsql;

-- Aprueba un pedido y dispara el pago de comisiones en una sola transacción. Idempotente.
create or replace function approve_order(p_order_id bigint)
returns void as $$
declare
  v_already_paid boolean;
begin
  select commission_paid into v_already_paid from orders where id = p_order_id;
  if v_already_paid then
    return;
  end if;

  update orders set status = 'success', commission_paid = true where id = p_order_id;

  perform pay_referral_commissions(p_order_id);
  perform pay_supplier_commissions(p_order_id);
end;
$$ language plpgsql;

-- Recalcula el nivel de lealtad de un usuario según su cantidad de referidos directos.
create or replace function recompute_loyalty_tier(p_profile_id uuid)
returns void as $$
declare
  v_referral_count int;
  v_new_tier_id bigint;
begin
  select count(*) into v_referral_count from profiles where referrer_id = p_profile_id;

  select id into v_new_tier_id
  from loyalty_tiers
  where min_referrals <= v_referral_count
  order by min_referrals desc
  limit 1;

  if v_new_tier_id is not null then
    update profiles set loyalty_tier_id = v_new_tier_id where id = p_profile_id;
  end if;
end;
$$ language plpgsql;

-- Aprueba/rechaza un retiro y pone en cero el balance correspondiente, atómico.
create or replace function process_withdrawal_request(p_request_id bigint, p_action text)
returns void as $$
declare
  v_profile_id uuid;
  v_amount numeric;
begin
  select profile_id, amount into v_profile_id, v_amount from withdrawal_requests where id = p_request_id;

  if p_action = 'approve' then
    update withdrawal_requests set status = 1, processed_at = now(), net_amount = v_amount - coalesce(freight_deduction,0) - coalesce(returns_deduction,0)
    where id = p_request_id;

    update wallet_balances set balance = 0 where profile_id = v_profile_id and wallet_type = 'referral';

    insert into wallet_ledger (profile_id, wallet_type, amount, previous_balance, new_balance, direction, status)
    values (v_profile_id, 'referral', -v_amount, v_amount, 0, 1, 1);
  elsif p_action = 'reject' then
    update withdrawal_requests set status = 2, processed_at = now() where id = p_request_id;
  end if;
end;
$$ language plpgsql;
