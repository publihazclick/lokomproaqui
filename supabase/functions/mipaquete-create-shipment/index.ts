// Genera la guia real de envio en Mipaquete para un pedido ya cotizado.
// Entrada: { order_id, delivery_company_id, delivery_company_name, request_pickup? }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const orderId = body.order_id;
    const deliveryCompanyId = body.delivery_company_id;
    if (!orderId || !deliveryCompanyId) return json({ error: 'order_id y delivery_company_id son requeridos' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: order, error: orderErr } = await admin
      .from('orders')
      .select('*, order_items(quantity, products(width, height, length, weight, client_sale_price, name)), profiles:seller_id(full_name, last_name, phone)')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) return json({ error: 'Pedido no encontrado' }, 404);
    if (order.mipaquete_shipment_id) return json({ error: 'Este pedido ya tiene guia generada', sending_id: order.mipaquete_shipment_id }, 409);
    if (!order.destino_dane_code) return json({ error: 'Pedido sin destino DANE, cotiza primero' }, 400);

    // Direccion de recogida: la del vendedor si la tiene guardada, si no un fallback generico.
    let pickup: any = null;
    if (order.seller_id) {
      const { data } = await admin.from('pickup_addresses').select('*').eq('profile_id', order.seller_id).order('id', { ascending: false }).limit(1).maybeSingle();
      pickup = data;
    }

    const items = (order as any).order_items || [];
    let totalWeight = 0, maxWidth = 20, maxHeight = 20, maxLength = 20, declaredValue = 0;
    for (const item of items) {
      const p = item.products || {};
      totalWeight += (Number(p.weight) || 1) * item.quantity;
      maxWidth = Math.max(maxWidth, Number(p.width) || 0);
      maxHeight = Math.max(maxHeight, Number(p.height) || 0);
      maxLength = Math.max(maxLength, Number(p.length) || 0);
      declaredValue += (Number(p.client_sale_price) || 0) * item.quantity;
    }
    const weightKg = Math.max(1, Math.ceil(totalWeight || 1));
    declaredValue = Math.max(1, Math.round(declaredValue || order.price_total || 1));

    const [buyerFirst, ...buyerRest] = (order.buyer_name || 'Cliente').trim().split(/\s+/);
    const sellerProfile: any = (order as any).profiles || {};

    // BUG CONOCIDO SIN RESOLVER (2026-07-09): Mipaquete rechaza este campo con
    // "paymentType is required or its format is not valid" tanto en 1/101 (numero) como
    // en "1"/"101" (texto). Nunca se habia probado createSending con datos reales antes de
    // hoy (todas las verificaciones previas del proyecto se quedaron en la cotizacion).
    // Necesita la documentacion oficial de Mipaquete para saber el valor/formato correcto
    // antes de seguir adivinando. Mientras tanto, generar guias reales falla en TODO pedido,
    // no solo en los de dropshipping/muestra nuevos.
    const paymentType = order.order_type === 'contraentrega' ? 101 : 1;
    const valueCollection = order.order_type === 'contraentrega' ? declaredValue + (Number(order.freight_value) || 0) : 0;

    const sendingPayload = {
      sender: {
        name: String(pickup?.first_name || sellerProfile.full_name || 'LokomproAqui'),
        surname: String(pickup?.last_name || sellerProfile.last_name || 'Vendedor'),
        cellPhone: String(pickup?.whatsapp || sellerProfile.phone || Deno.env.get('MIPAQUETE_DEFAULT_PHONE') || ''),
        prefix: '+57',
        email: String(pickup?.email || ''),
        pickupAddress: String(pickup?.address || Deno.env.get('MIPAQUETE_DEFAULT_ADDRESS') || ''),
        nit: String(pickup?.id_document || ''),
        nitType: 'CC',
      },
      receiver: {
        name: buyerFirst || 'Cliente',
        surname: buyerRest.join(' ') || '.',
        // Mipaquete exige un email con formato valido; orders no tiene columna de email del
        // comprador, asi que se usa un valor de respaldo generico cuando no hay uno real.
        email: String((order as any).buyer_email || 'pedidos@lokomproaqui.com'),
        prefix: '+57',
        cellPhone: String(order.buyer_phone || ''),
        destinationAddress: String(order.buyer_address || ''),
        // orders no tiene columna de documento del comprador; se usa el telefono como respaldo
        // (igual que el email, Mipaquete solo exige formato valido, no que sea la cedula real).
        nit: String((order as any).buyer_document || order.buyer_phone || '0000000000'),
        nitType: 'CC',
      },
      productInformation: {
        quantity: 1,
        width: maxWidth,
        large: maxLength,
        height: maxHeight,
        weight: weightKg,
        forbiddenProduct: false,
        productReference: String(items[0]?.products?.name || 'Producto'),
        declaredValue,
      },
      locate: {
        originDaneCode: String(order.origen_dane_code || Deno.env.get('MIPAQUETE_ORIGIN_DANE') || '11001000'),
        destinyDaneCode: String(order.destino_dane_code),
      },
      channel: 'LokomproAqui',
      deliveryCompany: String(deliveryCompanyId),
      criteria: 'price',
      description: String(items[0]?.products?.name || 'Producto'),
      comments: 'Pedido LokomproAqui #' + orderId,
      paymentType: String(paymentType),
      valueCollection,
      requestPickup: !!body.request_pickup,
    };

    const apiKey = Deno.env.get('MIPAQUETE_API_KEY') ?? '';
    if (!apiKey) return json({ error: 'MIPAQUETE_API_KEY no configurada' }, 500);

    const resp = await fetch('https://api.mipaquete.com/createSending', {
      method: 'POST',
      headers: { apikey: apiKey, 'session-tracker': crypto.randomUUID(), 'Content-Type': 'application/json' },
      body: JSON.stringify(sendingPayload),
    });

    const text = await resp.text();
    if (!resp.ok) return json({ error: 'Error al crear guia en Mipaquete', status: resp.status, detail: text.slice(0, 500) }, 502);

    let parsed: any;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }

    const sendingId = parsed?.mpCode ?? parsed?._id ?? parsed?.id ?? null;
    const guia = parsed?.guideNumber ?? parsed?.guide ?? parsed?.trackingNumber ?? sendingId;

    await admin.from('orders').update({
      mipaquete_shipment_id: sendingId,
      tracking_number: guia,
      carrier: body.delivery_company_name || deliveryCompanyId,
    }).eq('id', orderId);

    return json({ status: 'ok', sending_id: sendingId, guia, mipaquete_response: parsed });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
