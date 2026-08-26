-- Backfill de sincronia: documenta en git el estado REAL de las politicas RLS que ya
-- estan vivas en produccion (proyecto enajheqrfbglcpsqglnb) pero se habian aplicado
-- directo via Management API durante la sesion de la auditoria de seguridad 2026-08-25/26
-- sin pasar por un archivo de migracion. No cambia nada en producción (drop+create de lo
-- mismo que ya existe), solo evita que el historial de git quede desincronizado de la
-- base real -- ver [[feedback_sync_discipline_and_comments]].

create or replace function public.loko_is_admin()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$ select exists (select 1 from profiles p join roles r on r.id = p.role_id where p.id = auth.uid() and r.name = 'admin'); $function$;

-- acelerador_lessons
drop policy if exists "acelerador_lessons_admin_write" on acelerador_lessons;
create policy "acelerador_lessons_admin_write" on acelerador_lessons for all to public using (loko_is_admin()) with check (loko_is_admin());
drop policy if exists "acelerador_lessons_select_all" on acelerador_lessons;
create policy "acelerador_lessons_select_all" on acelerador_lessons for select to public using (true);

-- acelerador_modules
drop policy if exists "acelerador_modules_admin_write" on acelerador_modules;
create policy "acelerador_modules_admin_write" on acelerador_modules for all to public using (loko_is_admin()) with check (loko_is_admin());
drop policy if exists "acelerador_modules_select_all" on acelerador_modules;
create policy "acelerador_modules_select_all" on acelerador_modules for select to public using (true);

-- acelerador_payments
drop policy if exists "acelerador_payments_own_or_admin" on acelerador_payments;
create policy "acelerador_payments_own_or_admin" on acelerador_payments for all to public using (((profile_id = auth.uid()) OR loko_is_admin())) with check (((profile_id = auth.uid()) OR loko_is_admin()));

-- acelerador_subscriptions
drop policy if exists "acelerador_subscriptions_own_or_admin" on acelerador_subscriptions;
create policy "acelerador_subscriptions_own_or_admin" on acelerador_subscriptions for all to public using (((profile_id = auth.uid()) OR loko_is_admin())) with check (((profile_id = auth.uid()) OR loko_is_admin()));

-- banks
drop policy if exists "banks_own_or_admin" on banks;
create policy "banks_own_or_admin" on banks for all to public using (((profile_id = auth.uid()) OR loko_is_admin())) with check (((profile_id = auth.uid()) OR loko_is_admin()));

-- catalog_items
drop policy if exists "catalog_items_admin_write" on catalog_items;
create policy "catalog_items_admin_write" on catalog_items for all to public using (loko_is_admin()) with check (loko_is_admin());
drop policy if exists "catalog_items_select_all" on catalog_items;
create policy "catalog_items_select_all" on catalog_items for select to public using (true);

-- catalogs
drop policy if exists "catalogs_admin_write" on catalogs;
create policy "catalogs_admin_write" on catalogs for all to public using (loko_is_admin()) with check (loko_is_admin());
drop policy if exists "catalogs_select_all" on catalogs;
create policy "catalogs_select_all" on catalogs for select to public using (true);

-- categories
drop policy if exists "categories_admin_write" on categories;
create policy "categories_admin_write" on categories for all to public using (loko_is_admin()) with check (loko_is_admin());
drop policy if exists "categories_select_all" on categories;
create policy "categories_select_all" on categories for select to public using (true);

-- courses
drop policy if exists "courses_admin_write" on courses;
create policy "courses_admin_write" on courses for all to public using (loko_is_admin()) with check (loko_is_admin());
drop policy if exists "courses_select_all" on courses;
create policy "courses_select_all" on courses for select to public using (true);

-- departments
drop policy if exists "departments_admin_write" on departments;
create policy "departments_admin_write" on departments for all to public using (loko_is_admin()) with check (loko_is_admin());
drop policy if exists "departments_select_all" on departments;
create policy "departments_select_all" on departments for select to public using (true);

-- loyalty_tiers
drop policy if exists "loyalty_tiers_admin_write" on loyalty_tiers;
create policy "loyalty_tiers_admin_write" on loyalty_tiers for all to public using (loko_is_admin()) with check (loko_is_admin());
drop policy if exists "loyalty_tiers_select_all" on loyalty_tiers;
create policy "loyalty_tiers_select_all" on loyalty_tiers for select to public using (true);

-- neighborhoods
drop policy if exists "neighborhoods_admin_write" on neighborhoods;
create policy "neighborhoods_admin_write" on neighborhoods for all to public using (loko_is_admin()) with check (loko_is_admin());
drop policy if exists "neighborhoods_select_all" on neighborhoods;
create policy "neighborhoods_select_all" on neighborhoods for select to public using (true);

-- notifications
drop policy if exists "notifications_own_or_admin" on notifications;
create policy "notifications_own_or_admin" on notifications for all to public using (((profile_id = auth.uid()) OR loko_is_admin())) with check (((profile_id = auth.uid()) OR loko_is_admin()));

-- onboarding_requests
drop policy if exists "onboarding_requests_own_or_admin" on onboarding_requests;
create policy "onboarding_requests_own_or_admin" on onboarding_requests for all to public using (((profile_id = auth.uid()) OR loko_is_admin())) with check (((profile_id = auth.uid()) OR loko_is_admin()));

-- order_items
drop policy if exists "order_items_participants" on order_items;
create policy "order_items_participants" on order_items for all to public using ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_items.order_id) AND ((o.seller_id = auth.uid()) OR (o.supplier_id = auth.uid()) OR loko_is_admin()))))) with check ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_items.order_id) AND ((o.seller_id = auth.uid()) OR (o.supplier_id = auth.uid()) OR loko_is_admin())))));

-- orders
drop policy if exists "orders_all_participants" on orders;
create policy "orders_all_participants" on orders for all to public using (((seller_id = auth.uid()) OR (supplier_id = auth.uid()) OR loko_is_admin())) with check (((seller_id = auth.uid()) OR (supplier_id = auth.uid()) OR loko_is_admin()));

-- pickup_addresses
drop policy if exists "pickup_addresses_own_or_admin" on pickup_addresses;
create policy "pickup_addresses_own_or_admin" on pickup_addresses for all to public using (((profile_id = auth.uid()) OR loko_is_admin())) with check (((profile_id = auth.uid()) OR loko_is_admin()));

-- product_variants
drop policy if exists "product_variants_write" on product_variants;
create policy "product_variants_write" on product_variants for all to public using ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_variants.product_id) AND ((p.owner_profile_id = auth.uid()) OR loko_is_admin()))))) with check ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_variants.product_id) AND ((p.owner_profile_id = auth.uid()) OR loko_is_admin())))));
drop policy if exists "product_variants_select_all" on product_variants;
create policy "product_variants_select_all" on product_variants for select to public using (true);

-- product_wholesale_prices
drop policy if exists "pwp_write_admin" on product_wholesale_prices;
create policy "pwp_write_admin" on product_wholesale_prices for all to public using (loko_is_admin()) with check (loko_is_admin());
drop policy if exists "pwp_select_all" on product_wholesale_prices;
create policy "pwp_select_all" on product_wholesale_prices for select to public using (true);

-- products
drop policy if exists "products_write_owner_or_admin" on products;
create policy "products_write_owner_or_admin" on products for all to public using (((owner_profile_id = auth.uid()) OR loko_is_admin())) with check (((owner_profile_id = auth.uid()) OR loko_is_admin()));
drop policy if exists "products_select_all" on products;
create policy "products_select_all" on products for select to public using (true);

-- profiles
drop policy if exists "profiles_delete_admin" on profiles;
create policy "profiles_delete_admin" on profiles for delete to public using (loko_is_admin());
drop policy if exists "profiles_insert_own" on profiles;
create policy "profiles_insert_own" on profiles for insert to public with check ((id = auth.uid()));
drop policy if exists "profiles_select_all" on profiles;
create policy "profiles_select_all" on profiles for select to public using (true);
drop policy if exists "profiles_update_own_or_admin" on profiles;
create policy "profiles_update_own_or_admin" on profiles for update to public using (((id = auth.uid()) OR loko_is_admin())) with check (((id = auth.uid()) OR loko_is_admin()));

-- recharge_products
drop policy if exists "recharge_products_admin_write" on recharge_products;
create policy "recharge_products_admin_write" on recharge_products for all to public using (loko_is_admin()) with check (loko_is_admin());
drop policy if exists "recharge_products_select_all" on recharge_products;
create policy "recharge_products_select_all" on recharge_products for select to public using (true);

-- recharge_purchases
drop policy if exists "recharge_purchases_insert_own" on recharge_purchases;
create policy "recharge_purchases_insert_own" on recharge_purchases for insert to public with check ((profile_id = auth.uid()));
drop policy if exists "recharge_purchases_select_own_or_admin" on recharge_purchases;
create policy "recharge_purchases_select_own_or_admin" on recharge_purchases for select to public using (((profile_id = auth.uid()) OR loko_is_admin()));
drop policy if exists "recharge_purchases_update_admin" on recharge_purchases;
create policy "recharge_purchases_update_admin" on recharge_purchases for update to public using (loko_is_admin()) with check (loko_is_admin());

-- roles
drop policy if exists "roles_admin_write" on roles;
create policy "roles_admin_write" on roles for all to public using (loko_is_admin()) with check (loko_is_admin());
drop policy if exists "roles_select_all" on roles;
create policy "roles_select_all" on roles for select to public using (true);

-- seller_tiers
drop policy if exists "seller_tiers_admin_write" on seller_tiers;
create policy "seller_tiers_admin_write" on seller_tiers for all to public using (loko_is_admin()) with check (loko_is_admin());
drop policy if exists "seller_tiers_select_all" on seller_tiers;
create policy "seller_tiers_select_all" on seller_tiers for select to public using (true);

-- shopify_connections
drop policy if exists "shopify_connections_own_or_admin" on shopify_connections;
create policy "shopify_connections_own_or_admin" on shopify_connections for all to public using (((profile_id = auth.uid()) OR loko_is_admin())) with check (((profile_id = auth.uid()) OR loko_is_admin()));

-- shopify_pending_orders
drop policy if exists "shopify_pending_orders_own_or_admin" on shopify_pending_orders;
create policy "shopify_pending_orders_own_or_admin" on shopify_pending_orders for all to public using (((profile_id = auth.uid()) OR loko_is_admin())) with check (((profile_id = auth.uid()) OR loko_is_admin()));

-- shopify_sku_map
drop policy if exists "shopify_sku_map_own_or_admin" on shopify_sku_map;
create policy "shopify_sku_map_own_or_admin" on shopify_sku_map for all to public using (((profile_id = auth.uid()) OR loko_is_admin())) with check (((profile_id = auth.uid()) OR loko_is_admin()));

-- site_banners
drop policy if exists "site_banners_admin_write" on site_banners;
create policy "site_banners_admin_write" on site_banners for all to public using (loko_is_admin()) with check (loko_is_admin());
drop policy if exists "site_banners_select_all" on site_banners;
create policy "site_banners_select_all" on site_banners for select to public using (true);

-- site_config
drop policy if exists "site_config_admin_write" on site_config;
create policy "site_config_admin_write" on site_config for all to public using (loko_is_admin()) with check (loko_is_admin());
drop policy if exists "site_config_select_all" on site_config;
create policy "site_config_select_all" on site_config for select to public using (true);

-- size_types
drop policy if exists "size_types_admin_write" on size_types;
create policy "size_types_admin_write" on size_types for all to public using (loko_is_admin()) with check (loko_is_admin());
drop policy if exists "size_types_select_all" on size_types;
create policy "size_types_select_all" on size_types for select to public using (true);

-- sizes
drop policy if exists "sizes_admin_write" on sizes;
create policy "sizes_admin_write" on sizes for all to public using (loko_is_admin()) with check (loko_is_admin());
drop policy if exists "sizes_select_all" on sizes;
create policy "sizes_select_all" on sizes for select to public using (true);

-- standalone_shipments
drop policy if exists "standalone_shipments_own_or_admin" on standalone_shipments;
create policy "standalone_shipments_own_or_admin" on standalone_shipments for all to public using (((profile_id = auth.uid()) OR loko_is_admin())) with check (((profile_id = auth.uid()) OR loko_is_admin()));

-- supplier_payouts
drop policy if exists "supplier_payouts_insert_own_or_admin" on supplier_payouts;
create policy "supplier_payouts_insert_own_or_admin" on supplier_payouts for insert to public with check (((profile_id = auth.uid()) OR loko_is_admin()));
drop policy if exists "supplier_payouts_select_own_or_admin" on supplier_payouts;
create policy "supplier_payouts_select_own_or_admin" on supplier_payouts for select to public using (((profile_id = auth.uid()) OR loko_is_admin()));
drop policy if exists "supplier_payouts_update_admin" on supplier_payouts;
create policy "supplier_payouts_update_admin" on supplier_payouts for update to public using (loko_is_admin()) with check (loko_is_admin());

-- wallet_balances
drop policy if exists "wallet_balances_write_admin" on wallet_balances;
create policy "wallet_balances_write_admin" on wallet_balances for all to public using (loko_is_admin()) with check (loko_is_admin());
drop policy if exists "wallet_balances_select_own_or_admin" on wallet_balances;
create policy "wallet_balances_select_own_or_admin" on wallet_balances for select to public using (((profile_id = auth.uid()) OR loko_is_admin()));

-- wallet_ledger
drop policy if exists "wallet_ledger_write_admin" on wallet_ledger;
create policy "wallet_ledger_write_admin" on wallet_ledger for all to public using (loko_is_admin()) with check (loko_is_admin());
drop policy if exists "wallet_ledger_select_own_or_admin" on wallet_ledger;
create policy "wallet_ledger_select_own_or_admin" on wallet_ledger for select to public using (((profile_id = auth.uid()) OR loko_is_admin()));

-- wallet_topups
drop policy if exists "wallet_topups_insert_own" on wallet_topups;
create policy "wallet_topups_insert_own" on wallet_topups for insert to public with check ((profile_id = auth.uid()));
drop policy if exists "wallet_topups_select_own_or_admin" on wallet_topups;
create policy "wallet_topups_select_own_or_admin" on wallet_topups for select to public using (((profile_id = auth.uid()) OR loko_is_admin()));
drop policy if exists "wallet_topups_update_admin" on wallet_topups;
create policy "wallet_topups_update_admin" on wallet_topups for update to public using (loko_is_admin()) with check (loko_is_admin());

-- withdrawal_requests
drop policy if exists "withdrawal_requests_delete_own_or_admin" on withdrawal_requests;
create policy "withdrawal_requests_delete_own_or_admin" on withdrawal_requests for delete to public using (((profile_id = auth.uid()) OR loko_is_admin()));
drop policy if exists "withdrawal_requests_insert_own" on withdrawal_requests;
create policy "withdrawal_requests_insert_own" on withdrawal_requests for insert to public with check ((profile_id = auth.uid()));
drop policy if exists "withdrawal_requests_select_own_or_admin" on withdrawal_requests;
create policy "withdrawal_requests_select_own_or_admin" on withdrawal_requests for select to public using (((profile_id = auth.uid()) OR loko_is_admin()));
drop policy if exists "withdrawal_requests_update_admin" on withdrawal_requests;
create policy "withdrawal_requests_update_admin" on withdrawal_requests for update to public using (loko_is_admin()) with check (loko_is_admin());

-- woocommerce_connections
drop policy if exists "woocommerce_connections_own_or_admin" on woocommerce_connections;
create policy "woocommerce_connections_own_or_admin" on woocommerce_connections for all to public using (((profile_id = auth.uid()) OR loko_is_admin())) with check (((profile_id = auth.uid()) OR loko_is_admin()));

-- woocommerce_pending_orders
drop policy if exists "woocommerce_pending_orders_own_or_admin" on woocommerce_pending_orders;
create policy "woocommerce_pending_orders_own_or_admin" on woocommerce_pending_orders for all to public using (((profile_id = auth.uid()) OR loko_is_admin())) with check (((profile_id = auth.uid()) OR loko_is_admin()));

-- woocommerce_sku_map
drop policy if exists "woocommerce_sku_map_own_or_admin" on woocommerce_sku_map;
create policy "woocommerce_sku_map_own_or_admin" on woocommerce_sku_map for all to public using (((profile_id = auth.uid()) OR loko_is_admin())) with check (((profile_id = auth.uid()) OR loko_is_admin()));
