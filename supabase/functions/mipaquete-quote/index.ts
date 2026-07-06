// Cotiza el envio de un pedido con Mipaquete (multi-transportadora), reemplazando los 4
// transportadores viejos (Envia/Coordinadora/Inter Rapidisimo/TCC) cuyas credenciales ya no existen.
// Entrada: { order_id, destino_dane_code }
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
    const destinoCode = String(body.destino_dane_code || '').trim();
    if (!orderId || !destinoCode) return json({ error: 'order_id y destino_dane_code son requeridos' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: order, error: orderErr } = await admin
      .from('orders')
      .select('id, price_total, order_items(quantity, total_cost, products(width, height, length, weight, client_sale_price))')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) return json({ error: 'Pedido no encontrado' }, 404);

    const items = (order as any).order_items || [];
    let totalWeight = 0;
    let maxWidth = 20, maxHeight = 20, maxLength = 20;
    let declaredValue = 0;
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

    const apiKey = Deno.env.get('MIPAQUETE_API_KEY') ?? '';
    if (!apiKey) return json({ error: 'MIPAQUETE_API_KEY no configurada' }, 500);

    const payload = {
      originLocationCode: Deno.env.get('MIPAQUETE_ORIGIN_DANE') || '11001000',
      destinyLocationCode: destinoCode,
      height: maxHeight,
      width: maxWidth,
      length: maxLength,
      weight: weightKg,
      quantity: 1,
      declaredValue,
      saleValue: declaredValue,
    };

    const resp = await fetch('https://api.mipaquete.com/quoteShipping', {
      method: 'POST',
      headers: { apikey: apiKey, 'session-tracker': crypto.randomUUID(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await resp.text();
    if (!resp.ok) return json({ error: 'Mipaquete rechazo la cotizacion: ' + text.slice(0, 300), payload_sent: payload }, 200);

    let raw: any[] = [];
    try { raw = JSON.parse(text); } catch { raw = []; }

    const cotizaciones = (Array.isArray(raw) ? raw : []).map((c) => ({
      quote_id: c.id,
      delivery_company_id: c.deliveryCompanyId,
      delivery_company_name: c.deliveryCompanyName,
      logo_url: c.deliveryCompanyImgUrl ?? null,
      flete_costo: Number(c.shippingCost),
      tiempo_min: c.shippingTime ?? null,
      pickup_service: !!c.pickupService,
    })).sort((a, b) => a.flete_costo - b.flete_costo);

    await admin.from('orders').update({ destino_dane_code: destinoCode }).eq('id', orderId);

    return json({ order_id: orderId, destino_dane_code: destinoCode, declared_value: declaredValue, weight_kg: weightKg, cotizaciones });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return json({ error: message }, 200);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
