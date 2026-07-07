// Recibe el webhook "orders/create" de Shopify para una tienda ya conectada. Empareja cada linea
// por SKU (primero contra mapeos manuales ya confirmados, luego contra product_variants.sku global)
// y crea el pedido por el mismo camino que una venta manual (RPC create_order). Si alguna linea no
// empareja, el pedido completo queda pendiente de revision manual (nunca se crea a medias).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

async function hmacSha256Base64(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

Deno.serve(async (req) => {
  try {
    const rawBody = await req.text();
    const shopDomain = req.headers.get('x-shopify-shop-domain') || '';
    const hmacHeader = req.headers.get('x-shopify-hmac-sha256') || '';
    const topic = req.headers.get('x-shopify-topic') || '';

    if (!shopDomain || !hmacHeader) return new Response('Faltan headers de Shopify', { status: 400 });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: connection } = await admin
      .from('shopify_connections')
      .select('*')
      .eq('shop_domain', shopDomain)
      .eq('active', true)
      .maybeSingle();

    if (!connection) return new Response('Tienda no conectada', { status: 404 });

    const expectedHmac = await hmacSha256Base64(connection.api_secret, rawBody);
    if (expectedHmac !== hmacHeader) return new Response('Firma invalida', { status: 401 });

    if (topic && topic !== 'orders/create') return new Response('ok', { status: 200 });

    const order = JSON.parse(rawBody);
    const shopifyOrderId = String(order.id);

    // Idempotencia: Shopify puede reenviar el mismo webhook mas de una vez.
    const { data: alreadyCreated } = await admin.from('orders').select('id').eq('shopify_order_id', shopifyOrderId).maybeSingle();
    if (alreadyCreated) return new Response('ok', { status: 200 });

    const shippingAddress = order.shipping_address || order.billing_address || {};
    const customer = order.customer || {};
    const buyerName = [shippingAddress.first_name || customer.first_name, shippingAddress.last_name || customer.last_name]
      .filter(Boolean).join(' ') || shippingAddress.name || customer.email || 'Cliente Shopify';
    const buyerPhone = shippingAddress.phone || customer.phone || order.phone || '';
    const buyerAddress = [shippingAddress.address1, shippingAddress.address2].filter(Boolean).join(' ');
    const buyerCity = shippingAddress.city || '';
    const buyerNeighborhood = shippingAddress.province || '';

    const lineItems = order.line_items || [];
    const resolvedItems: any[] = [];
    const unresolvedItems: any[] = [];

    for (const li of lineItems) {
      const sku = String(li.sku || '').trim();
      let productId: number | null = null;
      let variantId: number | null = null;

      if (sku) {
        const { data: manualMap } = await admin
          .from('shopify_sku_map')
          .select('product_id, product_variant_id')
          .eq('profile_id', connection.profile_id)
          .eq('shopify_sku', sku)
          .maybeSingle();

        if (manualMap) {
          productId = manualMap.product_id;
          variantId = manualMap.product_variant_id;
        } else {
          const { data: variant } = await admin
            .from('product_variants')
            .select('id, product_id')
            .eq('sku', sku)
            .maybeSingle();
          if (variant) {
            productId = variant.product_id;
            variantId = variant.id;
          }
        }
      }

      const unitPrice = Number(li.price) || 0;
      const quantity = Number(li.quantity) || 1;

      if (productId) {
        resolvedItems.push({
          product_id: productId,
          product_variant_id: variantId,
          title: li.title || li.name || 'Producto Shopify',
          unit_price: unitPrice,
          quantity,
          size: null,
          color: null,
          seller_cost: null,
          total_cost: unitPrice * quantity,
        });
      } else {
        unresolvedItems.push({
          sku: sku || null,
          title: li.title || li.name || 'Producto sin nombre',
          quantity,
          unit_price: unitPrice,
        });
      }
    }

    if (unresolvedItems.length > 0) {
      // No se crea el pedido a medias: se manda TODO el pedido (incluidas las lineas que si
      // emparejaron, con su product_id/product_variant_id ya resueltos) a revision manual, para
      // que el dropshipper solo tenga que completar las que faltan.
      const allItemsForReview = [
        ...resolvedItems.map((r) => ({
          sku: null, title: r.title, quantity: r.quantity, unit_price: r.unit_price, matched: true,
          product_id: r.product_id, product_variant_id: r.product_variant_id,
        })),
        ...unresolvedItems.map((u) => ({ ...u, matched: false, product_id: null, product_variant_id: null })),
      ];

      await admin.from('shopify_pending_orders').upsert({
        profile_id: connection.profile_id,
        shopify_order_id: shopifyOrderId,
        shopify_order_number: order.name || order.order_number ? String(order.name || order.order_number) : null,
        buyer_name: buyerName,
        buyer_phone: buyerPhone,
        buyer_address: buyerAddress,
        buyer_city: buyerCity,
        buyer_neighborhood: buyerNeighborhood,
        financial_status: order.financial_status || null,
        items: allItemsForReview,
        resolved: false,
      }, { onConflict: 'profile_id,shopify_order_id' });

      return new Response('ok', { status: 200 });
    }

    const orderType = order.financial_status === 'paid' ? 'shopify' : 'contraentrega';

    const { data: orderId, error: createErr } = await admin.rpc('create_order', {
      order_data: {
        seller_id: connection.profile_id,
        buyer_name: buyerName,
        buyer_phone: buyerPhone,
        buyer_address: buyerAddress,
        buyer_city: buyerCity,
        buyer_neighborhood: buyerNeighborhood,
        order_type: orderType,
        freight_payer: 'tienda',
      },
      items: resolvedItems,
    });

    if (createErr || !orderId) {
      console.error('create_order fallo para pedido Shopify', shopifyOrderId, createErr);
      return new Response('ok', { status: 200 }); // Shopify no debe reintentar por un error de negocio (ej. sin stock)
    }

    await admin.from('orders').update({ shopify_order_id: shopifyOrderId }).eq('id', orderId);

    return new Response('ok', { status: 200 });
  } catch (error: unknown) {
    console.error('shopify-webhook error', error);
    return new Response('ok', { status: 200 }); // evitar que Shopify reintente indefinidamente por un error nuestro
  }
});
