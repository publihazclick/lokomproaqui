import { Injectable } from '@angular/core';
import { supabase } from '../services/supabase.client';
import { from } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ShopifyService {

  // Trae la conexion de Shopify del vendedor (null si no ha conectado ninguna tienda).
  getConnection(profileId: string) {
    const run = async (): Promise<any> => {
      const { data, error } = await supabase.from('shopify_connections').select('*').eq('profile_id', profileId).maybeSingle();
      if (error) return { success: false, data: null };
      return { success: true, data };
    };
    return from(run());
  }

  // data: { profile_id, shop_domain, access_token, api_secret }
  connect(data: any) {
    const run = async (): Promise<any> => {
      const { data: resp, error } = await supabase.functions.invoke('shopify-connect', {
        body: { action: 'connect', ...data },
      });
      if (error || !resp || resp.error) {
        return { success: false, message: (resp && resp.error) || 'No se pudo conectar la tienda' };
      }
      return { success: true, data: resp };
    };
    return from(run());
  }

  disconnect(profileId: string) {
    const run = async (): Promise<any> => {
      const { data: resp, error } = await supabase.functions.invoke('shopify-connect', {
        body: { action: 'disconnect', profile_id: profileId },
      });
      return { success: !error && !(resp && resp.error) };
    };
    return from(run());
  }

  // Pedidos de Shopify con al menos un item sin emparejar, pendientes de revision manual.
  getPendingOrders(profileId: string) {
    const run = async (): Promise<any> => {
      const { data, error } = await supabase
        .from('shopify_pending_orders')
        .select('*')
        .eq('profile_id', profileId)
        .eq('resolved', false)
        .order('created_at', { ascending: false });
      if (error || !data) return { success: false, data: [] };
      return { success: true, data };
    };
    return from(run());
  }

  // resolvedItems: [{ sku, title, quantity, unit_price, product_id, product_variant_id }] ya con
  // TODOS los items completos (los que ya venian emparejados + los que el dropshipper acaba de elegir).
  resolvePendingOrder(pendingOrder: any, profileId: string, resolvedItems: any[]) {
    const run = async (): Promise<any> => {
      // Guarda como mapeo permanente cada SKU que el dropshipper acaba de relacionar a mano,
      // para que los proximos pedidos con ese mismo SKU se emparejen solos.
      const newMappings = resolvedItems
        .filter((it: any) => it.sku && it.product_id)
        .map((it: any) => ({ profile_id: profileId, shopify_sku: it.sku, product_id: it.product_id, product_variant_id: it.product_variant_id || null }));
      if (newMappings.length) {
        await supabase.from('shopify_sku_map').upsert(newMappings, { onConflict: 'profile_id,shopify_sku', ignoreDuplicates: true });
      }

      const items = resolvedItems.map((it: any) => ({
        product_id: it.product_id,
        product_variant_id: it.product_variant_id || null,
        title: it.title,
        unit_price: it.unit_price,
        quantity: it.quantity,
        size: null,
        color: null,
        seller_cost: null,
        total_cost: it.unit_price * it.quantity,
      }));

      const orderType = pendingOrder.financial_status === 'paid' ? 'shopify' : 'contraentrega';

      const { data: orderId, error } = await supabase.rpc('create_order', {
        order_data: {
          seller_id: profileId,
          buyer_name: pendingOrder.buyer_name,
          buyer_phone: pendingOrder.buyer_phone,
          buyer_address: pendingOrder.buyer_address,
          buyer_city: pendingOrder.buyer_city,
          buyer_neighborhood: pendingOrder.buyer_neighborhood,
          order_type: orderType,
          freight_payer: 'tienda',
        },
        items,
      });

      if (error || !orderId) {
        const msg = error && error.message && error.message.includes('stock_insuficiente')
          ? 'Uno de los productos ya no tiene stock disponible'
          : 'No se pudo crear el pedido, intenta de nuevo';
        return { success: false, message: msg };
      }

      await supabase.from('orders').update({ shopify_order_id: pendingOrder.shopify_order_id }).eq('id', orderId);
      await supabase.from('shopify_pending_orders').update({ resolved: true }).eq('id', pendingOrder.id);

      return { success: true, data: { id: orderId } };
    };
    return from(run());
  }
}
