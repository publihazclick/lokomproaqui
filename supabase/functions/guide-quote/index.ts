// Cotiza una guia SUELTA de Mipaquete (modulo "Generacion de Guias", sin order_id detras -- ver
// mipaquete-quote/index.ts para el equivalente atado a pedidos, que no se toca). Entrada:
// { profile_id, destino_dane_code, weight, width, height, length, declared_value }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mismo umbral que fetchSeguroObligatorio (lokomproaqui-next/src/lib/ventas.ts) -- se replica aca
// server-side porque esta funcion no depende del cliente para decidir si el seguro es obligatorio.
const MINIMO_PEDIDOS_RIESGO = 5;
const TASA_DEVOLUCION_ALTO_RIESGO = 0.3;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const profileId = body.profile_id;
    const destinoCode = String(body.destino_dane_code || '').trim();
    if (!profileId || !destinoCode) return json({ error: 'profile_id y destino_dane_code son requeridos' }, 400);

    const weightKg = Math.max(1, Math.ceil(Number(body.weight) || 1));
    const width = Math.max(1, Number(body.width) || 20);
    const height = Math.max(1, Number(body.height) || 20);
    const length = Math.max(1, Number(body.length) || 20);
    const declaredValue = Math.max(1, Math.round(Number(body.declared_value) || 1));

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const apiKey = Deno.env.get('MIPAQUETE_API_KEY') ?? '';
    if (!apiKey) return json({ error: 'MIPAQUETE_API_KEY no configurada' }, 500);

    const payload = {
      originLocationCode: Deno.env.get('MIPAQUETE_ORIGIN_DANE') || '11001000',
      destinyLocationCode: destinoCode,
      height,
      width,
      length,
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

    // Mismo margen fijo que mipaquete-quote/index.ts (linea 81) -- si el monto cambia algun dia,
    // los 2 archivos deben cambiar juntos.
    const MARGEN_LOKOMPROAQUI_COP = 4000;

    const cotizaciones = (Array.isArray(raw) ? raw : []).map((c) => ({
      quote_id: c.id,
      delivery_company_id: c.deliveryCompanyId,
      delivery_company_name: c.deliveryCompanyName,
      logo_url: c.deliveryCompanyImgUrl ?? null,
      flete_costo: Number(c.shippingCost) + MARGEN_LOKOMPROAQUI_COP,
      tiempo_min: c.shippingTime ?? null,
      pickup_service: !!c.pickupService,
    })).sort((a, b) => a.flete_costo - b.flete_costo);

    // Fase 1 del plan de reduccion de devoluciones, aplicado aca a nivel vendedor (no hay producto
    // en una guia suelta) -- mismas vistas/umbral que fetchSeguroObligatorio.
    const { data: stats } = await admin
      .from('seller_return_stats')
      .select('total_orders, return_rate')
      .eq('seller_id', profileId)
      .maybeSingle();
    const insuranceForced = !!(stats && stats.total_orders >= MINIMO_PEDIDOS_RIESGO && stats.return_rate >= TASA_DEVOLUCION_ALTO_RIESGO);

    return json({
      destino_dane_code: destinoCode,
      declared_value: declaredValue,
      weight_kg: weightKg,
      cotizaciones,
      insurance_forced: insuranceForced,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return json({ error: message }, 200);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
