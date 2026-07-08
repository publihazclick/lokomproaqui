// Recibe el webhook "order.created" de WooCommerce para una tienda ya conectada. Empareja cada linea
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

function normalizeUrl(input: string): string {
  return String(input || '').trim().replace(/\/+$/, '');
}

Deno.serve(async (req) => {
  try {
    const rawBody = await req.text();
    const webhookId = req.headers.get('x-wc-webhook-id') || '';
    const source = req.headers.get('x-wc-webhook-source') || '';
    const signature = req.headers.get('x-wc-webhook-signature') || '';
    const topic = req.headers.get('x-wc-webhook-topic') || '';

    // WooCommerce manda una peticion de prueba (ping) sin firma al crear el webhook.
    if (!signature) return new Response('ok', { status: 200 });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    let connection: any = null;
    if (webhookId) {
      const { data } = await admin
        .from('woocommerce_connections')
        .select('*')
        .eq('woocommerce_webhook_id', webhookId)
        .eq('active', true)
        .maybeSingle();
      connection = data;
    }
    if (!connection && source) {
      const normalizedSource = normalizeUrl(source);
      const { data } = await admin.from('woocommerce_connections').select('*').eq('active', true);
      connection = (data || []).find((c: any) => normalizeUrl(c.store_url) === normalizedSource) || null;
    }

    if (!connection) return new Response('Tienda no conectada', { status: 404 });

    const expectedSignature = await hmacSha256Base64(connection.webhook_secret, rawBody);
    if (expectedSignature !== signature) return new Response('Firma invalida', { status: 401 });

    if (topic && topic !== 'order.created') return new Response('ok', { status: 200 });

    const order = JSON.parse(rawBody);
    const woocommerceOrderId = String(order.id);

    // Idempotencia: WooCommerce puede reenviar el mismo webhook mas de una vez.
    const { data: alreadyCreated } = await admin.from('orders').select('id').eq('woocommerce_order_id', woocommerceOrderId).maybeSingle();
    if (alreadyCreated) return new Response('ok', { status: 200 });

    const shipping = order.shipping || {};
    const billing = order.billing || {};
    const hasShippingAddress = !!shipping.address_1;

    const buyerName = [shipping.first_name || billing.first_name, shipping.last_name || billing.last_name]
      .filter(Boolean).join(' ') || billing.email || 'Cliente WooCommerce';
    const buyerPhone = billing.phone || '';
    const buyerAddress = hasShippingAddress
      ? [shipping.address_1, shipping.address_2].filter(Boolean).join(' ')
      : [billing.address_1, billing.address_2].filter(Boolean).join(' ');
    const buyerCity = (hasShippingAddress ? shipping.city : billing.city) || '';
    const buyerNeighborhood = (hasShippingAddress ? shipping.state : billing.state) || '';

    const lineItems = order.line_items || [];
    const resolvedItems: any[] = [];
    const unresolvedItems: any[] = [];

    for (const li of lineItems) {
      const sku = String(li.sku || '').trim();
      let productId: number | null = null;
      let variantId: number | null = null;

      if (sku) {
        const { data: manualMap } = await admin
          .from('woocommerce_sku_map')
          .select('product_id, product_variant_id')
          .eq('profile_id', connection.profile_id)
          .eq('woocommerce_sku', sku)
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
          title: li.name || 'Producto WooCommerce',
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
          title: li.name || 'Producto sin nombre',
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

      await admin.from('woocommerce_pending_orders').upsert({
        profile_id: connection.profile_id,
        woocommerce_order_id: woocommerceOrderId,
        woocommerce_order_number: order.number ? String(order.number) : null,
        buyer_name: buyerName,
        buyer_phone: buyerPhone,
        buyer_address: buyerAddress,
        buyer_city: buyerCity,
        buyer_neighborhood: buyerNeighborhood,
        financial_status: order.status || null,
        items: allItemsForReview,
        resolved: false,
      }, { onConflict: 'profile_id,woocommerce_order_id' });

      return new Response('ok', { status: 200 });
    }

    // Heuristica de pago: "processing"/"completed" en WooCommerce significa que el pago ya se registro
    // (pasarela en linea); "pending"/"on-hold" son tipicos de pedidos contra entrega.
    const orderType = (order.status === 'processing' || order.status === 'completed') ? 'woocommerce' : 'contraentrega';

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
      console.error('create_order fallo para pedido WooCommerce', woocommerceOrderId, createErr);
      return new Response('ok', { status: 200 }); // WooCommerce no debe reintentar por un error de negocio (ej. sin stock)
    }

    await admin.from('orders').update({ woocommerce_order_id: woocommerceOrderId }).eq('id', orderId);

    return new Response('ok', { status: 200 });
  } catch (error: unknown) {
    console.error('woocommerce-webhook error', error);
    return new Response('ok', { status: 200 }); // evitar que WooCommerce reintente indefinidamente por un error nuestro
  }
});
