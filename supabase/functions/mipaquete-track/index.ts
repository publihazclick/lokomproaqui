// Consulta el estado de una guia ya generada. Entrada: { order_id }
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
    if (!orderId) return json({ error: 'order_id requerido' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: order, error: orderErr } = await admin
      .from('orders').select('id, seller_id, mipaquete_shipment_id, carrier, tracking_number').eq('id', orderId).single();

    if (orderErr || !order) return json({ error: 'Pedido no encontrado' }, 404);
    if (!order.mipaquete_shipment_id) return json({ tracking: [], mensaje: 'Guia no generada aun' });

    const apiKey = Deno.env.get('MIPAQUETE_API_KEY') ?? '';
    if (!apiKey) return json({ error: 'MIPAQUETE_API_KEY no configurada' }, 500);

    const resp = await fetch(
      `https://api.mipaquete.com/sendingtracking/${encodeURIComponent(order.mipaquete_shipment_id)}?deliveryCompany=${encodeURIComponent(order.carrier || '')}`,
      { headers: { apikey: apiKey, 'Content-Type': 'application/json' } },
    );

    const text = await resp.text();
    if (!resp.ok) return json({ error: 'Error al consultar tracking', status: resp.status, detail: text.slice(0, 500) }, 200);

    let parsed: any;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }

    const eventos = Array.isArray(parsed) ? parsed
      : Array.isArray(parsed?.events) ? parsed.events
      : Array.isArray(parsed?.tracking) ? parsed.tracking
      : [];

    await admin.from('shipment_settlement_logs').insert({
      order_id: orderId, profile_id: order.seller_id, data: { tracking: eventos }, status: 1,
    });

    return json({ sending_id: order.mipaquete_shipment_id, guia: order.tracking_number, tracking: eventos, raw: parsed });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
