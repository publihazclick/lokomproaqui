// Consulta el estado real de una guia ya generada y lo guarda en orders.tracking_*.
// Entrada: { order_id }. Usado bajo demanda (boton "Actualizar estado" del panel admin) y
// tambien reutilizado por mipaquete-sync-tracking (cron) para cada pedido individual.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// BUG REAL CORREGIDO (2026-07-10): esta funcion nunca se probo contra la API real (nunca se
// invocaba desde ninguna pantalla del frontend). Tenia 2 errores: le faltaba el header
// session-tracker (que si tienen mipaquete-quote/mipaquete-create-shipment, ya confirmados
// funcionando con guias reales), y apuntaba a un endpoint que no es el documentado oficialmente
// (usaba /sendingtracking/{id}?deliveryCompany=X). El endpoint real, confirmado contra la
// coleccion Postman oficial de Mipaquete, es GET /getSendingTracking?mpCode=<id>.
// No se exporta para que otras funciones lo importen: cada Edge Function en este proyecto se
// despliega como directorio independiente (supabase-go.exe sube cada carpeta por separado, sin
// bundler), asi que un import entre carpetas de funciones distintas no se empaqueta y falla en
// runtime. mipaquete-sync-tracking tiene su propia copia identica de esta funcion.
async function fetchTracking(mipaqueteShipmentId: string, apiKey: string) {
  const resp = await fetch(
    `https://api.mipaquete.com/getSendingTracking?mpCode=${encodeURIComponent(mipaqueteShipmentId)}`,
    { headers: { apikey: apiKey, 'session-tracker': crypto.randomUUID(), 'Content-Type': 'application/json' } },
  );
  const text = await resp.text();
  if (!resp.ok) return { ok: false as const, status: resp.status, detail: text.slice(0, 500) };

  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }

  const eventos = Array.isArray(parsed?.tracking) ? parsed.tracking
    : Array.isArray(parsed) ? parsed
    : Array.isArray(parsed?.events) ? parsed.events
    : [];

  // El ultimo evento por fecha es el estado actual (Mipaquete no garantiza que ya venga ordenado).
  const ultimo = eventos.length
    ? [...eventos].sort((a: any, b: any) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()).slice(-1)[0]
    : null;

  return { ok: true as const, eventos, estadoActual: ultimo?.updateState || null, raw: parsed };
}

// No hay lista oficial completa de `updateState` de Mipaquete (mismo problema documentado arriba
// para PALABRAS_TERMINALES en mipaquete-sync-tracking) -- se matchea por palabra clave en vez de un
// enum cerrado. 'entregad' -> approve_order (paga comisiones multinivel de referidos/proveedores y,
// en dropshipping/muestra, devuelve el flete prepagado al vendedor). 'devuelt'/'cancelad'/'rechazad'
// -> reject_order (marca rechazado y, si el pedido tenia el seguro antidevoluciones activo, devuelve
// el flete). Duplicado a proposito en mipaquete-sync-tracking (ver nota de fetchTracking arriba).
function resolverAccionAutomatica(estado: string | null): 'approve_order' | 'reject_order' | null {
  if (!estado) return null;
  const bajo = estado.toLowerCase();
  if (bajo.includes('entregad')) return 'approve_order';
  if (bajo.includes('devuelt') || bajo.includes('cancelad') || bajo.includes('rechazad')) return 'reject_order';
  return null;
}

// Fase 0 del plan de reduccion de devoluciones (pedido explicito del usuario 2026-07-19): mismo
// clasificador que mipaquete-sync-tracking (ver esa nota ampliada) -- duplicado a proposito, mismo
// motivo de siempre (cada Edge Function se despliega sin bundler entre carpetas).
function resolverMotivoDevolucion(estado: string | null): string {
  if (!estado) return 'otro';
  const bajo = estado.toLowerCase();
  if (bajo.includes('direccion') || bajo.includes('dirección')) return 'direccion_invalida';
  if (bajo.includes('no contest') || bajo.includes('no responde') || bajo.includes('no contactad')) return 'no_contesto';
  if (bajo.includes('no encontr') || bajo.includes('ausente') || bajo.includes('no habia nadie') || bajo.includes('no había nadie')) return 'no_encontrado';
  if (bajo.includes('rechaz') || bajo.includes('no acept') || bajo.includes('no quiso') || bajo.includes('se arrepint')) return 'se_arrepintio';
  return 'otro';
}

// Fase 2 del plan de reduccion de devoluciones: mismo par (palabras clave + envio de plantilla) que
// mipaquete-sync-tracking -- duplicado a proposito, mismo motivo de siempre.
const PALABRAS_EN_CAMINO = ['en camino', 'en reparto', 'en ruta', 'transito', 'tránsito'];

function estaEnCamino(estado: string | null): boolean {
  if (!estado) return false;
  const bajo = estado.toLowerCase();
  return PALABRAS_EN_CAMINO.some((p) => bajo.includes(p));
}

function normalizarTelefono(raw: string | null): string | null {
  const digitos = (raw || '').replace(/\D/g, '');
  const ultimos10 = digitos.slice(-10);
  if (ultimos10.length < 10) return null;
  return `57${ultimos10}`;
}

async function notificarEnCamino(pedido: any, accessToken: string, phoneNumberId: string): Promise<string | null> {
  const telefono = normalizarTelefono(pedido.buyer_phone);
  if (!telefono) return null;
  const direccion = `${pedido.buyer_address || ''}, ${pedido.buyer_city || ''}`.trim();

  const resp = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: telefono,
      type: 'template',
      template: {
        name: 'envio_en_camino_lokomproaqui',
        language: { code: 'es' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: pedido.buyer_name || 'Cliente' },
            { type: 'text', text: direccion || 'tu dirección' },
          ],
        }],
      },
    }),
  });
  if (!resp.ok) return null;
  const parsed = await resp.json().catch(() => ({}));
  return parsed?.messages?.[0]?.id || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const orderId = body.order_id;
    if (!orderId) return json({ error: 'order_id requerido' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: order, error: orderErr } = await admin
      .from('orders')
      .select('id, seller_id, mipaquete_shipment_id, carrier, tracking_number, tracking_status, order_type, buyer_name, buyer_phone, buyer_address, buyer_city, delivery_notified_at')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) return json({ error: 'Pedido no encontrado' }, 404);
    if (!order.mipaquete_shipment_id) return json({ tracking: [], mensaje: 'Guia no generada aun' });

    const apiKey = Deno.env.get('MIPAQUETE_API_KEY') ?? '';
    if (!apiKey) return json({ error: 'MIPAQUETE_API_KEY no configurada' }, 500);

    const result = await fetchTracking(order.mipaquete_shipment_id, apiKey);
    if (!result.ok) return json({ error: 'Error al consultar tracking', status: result.status, detail: result.detail }, 200);

    // Pedido explicito del usuario 2026-07-18: que el estado real de la guia (Mipaquete) mueva solo
    // el pedido, sin depender de que alguien entre al panel a cambiarlo a mano. approve_order/
    // reject_order ya son idempotentes (approve_order no-opea si commission_paid, reject_order no
    // vuelve a acreditar el flete si prev_status ya era 'rejected'), asi que llamarlas de mas (ej. el
    // usuario aprieta "Actualizar estado" dos veces sobre un pedido ya entregado) es seguro.
    //
    // Mismo orden que mipaquete-sync-tracking (bug real corregido 2026-07-19): tracking_status solo
    // se persiste como terminal si la accion de dinero ya tuvo exito -- si el RPC falla, se deja el
    // estado anterior para que un reintento (otro clic en "Actualizar estado") lo vuelva a intentar
    // en vez de quedar marcado como terminal sin que el dinero se haya movido.
    const accion = resolverAccionAutomatica(result.estadoActual);
    let accionOk = true;
    if (accion) {
      const { error: rpcErr } = await admin.rpc(accion, { p_order_id: orderId });
      if (rpcErr) {
        accionOk = false;
        await admin.from('shipment_settlement_logs').insert({ order_id: orderId, profile_id: order.seller_id, data: { accion, error: rpcErr.message }, status: 0 });
      }
    }

    // Fase 2 del plan de reduccion de devoluciones: mismo guard que mipaquete-sync-tracking, ver
    // esa nota ampliada.
    let notificacionEnCaminoId: string | null = null;
    const waToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
    const waPhoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
    if (!order.delivery_notified_at && order.order_type === 'contraentrega' && estaEnCamino(result.estadoActual) && waToken && waPhoneId) {
      notificacionEnCaminoId = await notificarEnCamino(order, waToken, waPhoneId);
    }

    await admin.from('orders').update({
      tracking_status: accionOk ? result.estadoActual : order.tracking_status ?? null,
      tracking_history: result.eventos,
      // Fase 0 del plan de reduccion de devoluciones: motivo automatico solo cuando de verdad se
      // rechazo el pedido.
      ...(accionOk && accion === 'reject_order' ? { return_reason: resolverMotivoDevolucion(result.estadoActual) } : {}),
      ...(notificacionEnCaminoId ? { delivery_notified_at: new Date().toISOString(), delivery_notification_message_id: notificacionEnCaminoId } : {}),
      tracking_synced_at: new Date().toISOString(),
    }).eq('id', orderId);

    await admin.from('shipment_settlement_logs').insert({
      order_id: orderId, profile_id: order.seller_id, data: { tracking: result.eventos }, status: 1,
    });

    return json({ sending_id: order.mipaquete_shipment_id, guia: order.tracking_number, tracking: result.eventos, estado_actual: result.estadoActual, accion_automatica: accion, raw: result.raw });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
