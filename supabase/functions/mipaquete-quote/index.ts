// Cotiza el envio de un pedido con Mipaquete (multi-transportadora), reemplazando los 4
// transportadores viejos (Envia/Coordinadora/Inter Rapidisimo/TCC) cuyas credenciales ya no existen.
// Entrada: { order_id, destino_dane_code }
//
// CAMBIO 2026-07-29 (pedido explicito del usuario): se migro de la API publica de pago
// (api.mipaquete.com + MIPAQUETE_API_KEY) a la API interna login-based (core.mipaquete.com,
// misma que ya usaba mipaquete-sync-tracking para Martinica -- ver memoria
// mipaquete_internal_api_lokomproaqui). Bug real resuelto en el camino: originCountryCode/
// destinyCountryCode NO son codigos ISO ("CO") sino el codigo de pais INTERNO de Mipaquete
// ("170" para Colombia, visible en user.countryCode del login) -- "CO" pasaba la validacion
// de "campo presente" pero no matcheaba ningun pais real, asi el motor de cotizacion devolvia
// [] en silencio (200 OK, sin error) para CUALQUIER ruta. Confirmado con cotizacion real
// Bogota->Medellin: Servientrega $21.600, TCC $26.900, Envia $19.100, Coordinadora $27.150.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Constantes publicas del frontend de app.mipaquete.com (extraidas de su propio bundle JS,
// no son secretos de la cuenta): customer-key generico para login/otros endpoints vs. el
// especifico que exige el motor de cotizacion (/routes/quoteShipping, /routes/getLocations).
const LOGIN_CUSTOMER_KEY = 'b0c6d2aa-4d53-11eb-ae93-0242ac130002';
const QUOTE_CUSTOMER_KEY = '74390816-b8bd-4c38-8c5d-4453256c110e';
// Codigo de pais INTERNO de Mipaquete para Colombia (ver comentario arriba) -- Mipaquete solo
// opera en Colombia hoy, asi que este valor nunca cambia.
const MIPAQUETE_COUNTRY_CODE = '170';

let cachedToken: string | null = null;
let cachedTokenAt = 0;
const TOKEN_CACHE_TTL_MS = 1000 * 60 * 20; // 20 minutos, igual que el patron ya probado en Martinica

async function getMipaqueteToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now - cachedTokenAt < TOKEN_CACHE_TTL_MS) return cachedToken;

  const email = Deno.env.get('MIPAQUETE_WEB_EMAIL');
  const password = Deno.env.get('MIPAQUETE_WEB_PASSWORD');
  if (!email || !password) throw new Error('MIPAQUETE_WEB_EMAIL/MIPAQUETE_WEB_PASSWORD no configuradas');

  const resp = await fetch('https://core.mipaquete.com/users/loginUser', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'customer-key': LOGIN_CUSTOMER_KEY,
      'session-tracker': crypto.randomUUID(),
    },
    body: JSON.stringify({ email, password }),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error('Mipaquete rechazo el login: ' + text.slice(0, 300));

  let data: any;
  try { data = JSON.parse(text); } catch { data = null; }
  const token = data?.token;
  if (!token) throw new Error('Mipaquete no devolvio token en el login');

  cachedToken = token;
  cachedTokenAt = now;
  return token;
}

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
      .select('id, price_total, supplier_id, order_items(quantity, total_cost, products(width, height, length, weight, client_sale_price))')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) return json({ error: 'Pedido no encontrado' }, 404);

    // Ciudad de origen real del PROVEEDOR (Fase 3 del plan de aislamiento proveedor<->vendedor,
    // migracion 059/060 -- misma pickup_addresses ya usada por "Generacion de Guias"): antes esto
    // SIEMPRE cotizaba "desde Bogota" sin importar donde estuviera el proveedor que va a despachar.
    let origenDaneCode = Deno.env.get('MIPAQUETE_ORIGIN_DANE') || '11001000';
    if (order.supplier_id) {
      const { data: pickup } = await admin
        .from('pickup_addresses')
        .select('city_dane_code')
        .eq('profile_id', order.supplier_id)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pickup?.city_dane_code) origenDaneCode = pickup.city_dane_code;
    }

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

    const token = await getMipaqueteToken();

    const payload = {
      originCountryCode: MIPAQUETE_COUNTRY_CODE,
      originLocationCode: origenDaneCode,
      destinyCountryCode: MIPAQUETE_COUNTRY_CODE,
      destinyLocationCode: destinoCode,
      height: maxHeight,
      width: maxWidth,
      length: maxLength,
      weight: weightKg,
      quantity: 1,
      declaredValue,
      // saleValue va en 0 al cotizar (mismo valor que manda la app real de Mipaquete en este
      // paso) -- el valor de venta real solo se necesita al crear la guia, no al cotizar.
      saleValue: 0,
    };

    const resp = await fetch('https://core.mipaquete.com/routes/quoteShipping', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'customer-key': QUOTE_CUSTOMER_KEY,
        'session-tracker': crypto.randomUUID(),
        token,
      },
      body: JSON.stringify(payload),
    });

    const text = await resp.text();
    if (!resp.ok) return json({ error: 'Mipaquete rechazo la cotizacion: ' + text.slice(0, 300), payload_sent: payload }, 200);

    let raw: any[] = [];
    try { raw = JSON.parse(text); } catch { raw = []; }

    // Margen fijo de LokomproAqui por guia, pedido explicito del usuario 2026-07-18: se suma UNA
    // sola vez aca, sobre el costo real que devuelve Mipaquete -- de aca en adelante ese numero YA
    // marcado es "el flete" para todo el resto del sistema (se guarda en orders.freight_value via
    // actualizarFleteYTransportadora, y de ahi alimenta tanto el recaudo contra entrega como el
    // debito de la wallet dropshipper), sin tocar ningun otro archivo. Mipaquete nunca ve este
    // numero, solo cobra su tarifa real -- la diferencia es el margen. El otro lado de la cuenta
    // (que esos $4.000 nunca se le devuelvan al vendedor) vive en approve_order/reject_order, ver
    // migracion 038_flete_margen_lokomproaqui.sql -- los 3 archivos deben cambiar juntos si el
    // monto del margen cambia algun dia.
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
