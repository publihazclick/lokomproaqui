// Actualizacion automatica en segundo plano del estado real de las guias (cron cada 30 min via
// pg_cron + pg_net, ver migracion 029_mipaquete_tracking_cron.sql). Sin usuario de por medio,
// funcion publica (--no-verify-jwt). Recorre pedidos con guia activa, consulta Mipaquete y
// guarda el estado real en orders.tracking_*.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mismo endpoint y logica que mipaquete-track/index.ts (duplicado a proposito: cada Edge
// Function se despliega como carpeta independiente, sin bundler entre funciones distintas).
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

  const ultimo = eventos.length
    ? [...eventos].sort((a: any, b: any) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()).slice(-1)[0]
    : null;

  return { ok: true as const, eventos, estadoActual: ultimo?.updateState || null, raw: parsed };
}

// Palabras clave que indican que el envio ya llego a un estado final: dejar de consultarlo en
// las proximas corridas del cron (no hay una lista oficial completa de estados de Mipaquete).
const PALABRAS_TERMINALES = ['entregad', 'devuelt', 'cancelad', 'rechazad'];

function esEstadoTerminal(estado: string | null): boolean {
  if (!estado) return false;
  const bajo = estado.toLowerCase();
  return PALABRAS_TERMINALES.some((p) => bajo.includes(p));
}

// Pedido explicito del usuario 2026-07-18: que el estado real de la guia mueva el pedido solo
// (pagar comisiones, devolver flete), sin depender de que alguien entre al panel a cambiarlo a
// mano. 'entregad' -> approve_order (paga comisiones multinivel de referidos/proveedores y, en
// dropshipping/muestra, devuelve el flete prepagado al vendedor). 'devuelt'/'cancelad'/'rechazad'
// -> reject_order (marca rechazado y, si el pedido tenia el seguro antidevoluciones activo,
// devuelve el flete). Ambas RPC son idempotentes (approve_order no-opea si commission_paid ya es
// true, reject_order no vuelve a acreditar el flete si prev_status ya era 'rejected'), asi que no
// hay riesgo de pagar/devolver dos veces aunque el cron reprocese el mismo pedido. Duplicado a
// proposito en mipaquete-track (ver nota de fetchTracking arriba sobre por que no se comparte).
function resolverAccionAutomatica(estado: string | null): 'approve_order' | 'reject_order' | null {
  if (!estado) return null;
  const bajo = estado.toLowerCase();
  if (bajo.includes('entregad')) return 'approve_order';
  if (bajo.includes('devuelt') || bajo.includes('cancelad') || bajo.includes('rechazad')) return 'reject_order';
  return null;
}

// Fase 0 del plan de reduccion de devoluciones (pedido explicito del usuario 2026-07-19):
// clasificacion best-effort del motivo real de devolucion a partir del texto libre que reporta
// Mipaquete -- no hay una lista oficial cerrada de estados, asi que se matchea por palabra clave
// (mismo patron que resolverAccionAutomatica arriba). Solo se llama cuando la accion resuelta es
// 'reject_order'. Si no matchea nada especifico, cae en 'otro' -- mejor un motivo generico que
// ninguno, para que el dashboard de Fase 4 al menos cuente el volumen real.
function resolverMotivoDevolucion(estado: string | null): string {
  if (!estado) return 'otro';
  const bajo = estado.toLowerCase();
  if (bajo.includes('direccion') || bajo.includes('dirección')) return 'direccion_invalida';
  if (bajo.includes('no contest') || bajo.includes('no responde') || bajo.includes('no contactad')) return 'no_contesto';
  if (bajo.includes('no encontr') || bajo.includes('ausente') || bajo.includes('no habia nadie') || bajo.includes('no había nadie')) return 'no_encontrado';
  if (bajo.includes('rechaz') || bajo.includes('no acept') || bajo.includes('no quiso') || bajo.includes('se arrepint')) return 'se_arrepintio';
  return 'otro';
}

const LIMITE_POR_CORRIDA = 50;
const DIAS_TOPE = 60; // no seguir consultando pedidos mas viejos que esto, aunque no tengan estado terminal detectado.
const ESPERA_ENTRE_LLAMADOS_MS = 250;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const apiKey = Deno.env.get('MIPAQUETE_API_KEY') ?? '';
    if (!apiKey) return json({ error: 'MIPAQUETE_API_KEY no configurada' }, 500);

    const topeFecha = new Date(Date.now() - DIAS_TOPE * 24 * 60 * 60 * 1000).toISOString();

    const { data: pedidos, error: selectErr } = await admin
      .from('orders')
      .select('id, mipaquete_shipment_id, tracking_status')
      .not('mipaquete_shipment_id', 'is', null)
      .neq('status', 'deleted')
      .gte('created_at', topeFecha)
      .order('tracking_synced_at', { ascending: true, nullsFirst: true })
      .limit(LIMITE_POR_CORRIDA * 2); // se trae un poco de mas margen, se filtra terminal abajo (Postgrest no filtra bien "contains alguna de estas palabras" en un solo .not())

    if (selectErr) return json({ error: selectErr.message }, 500);

    const pendientes = (pedidos || []).filter((p) => !esEstadoTerminal(p.tracking_status)).slice(0, LIMITE_POR_CORRIDA);

    let actualizados = 0;
    let errores = 0;
    let accionesAutomaticas = 0;

    for (const pedido of pendientes) {
      const result = await fetchTracking(pedido.mipaquete_shipment_id, apiKey);
      if (!result.ok) {
        errores++;
        await sleep(ESPERA_ENTRE_LLAMADOS_MS);
        continue;
      }

      // BUG REAL CORREGIDO 2026-07-19: antes se guardaba tracking_status = estado terminal ANTES de
      // llamar approve_order/reject_order. Si esa llamada fallaba (timeout, blip de red/DB -- pasa
      // en produccion), el pedido quedaba con un tracking_status terminal PERO sin que el dinero se
      // hubiera movido -- y como el filtro de arriba (esEstadoTerminal) excluye pedidos terminales de
      // toda corrida futura, ese pedido quedaba huerfano para siempre: nunca se le pagaban comisiones
      // ni se le devolvia el flete, y nadie se enteraba salvo que un admin revisara
      // shipment_settlement_logs a mano. Ahora tracking_status SOLO se persiste como terminal si la
      // accion de dinero ya tuvo exito (o si no habia ninguna accion que ejecutar) -- si el RPC
      // falla, tracking_status se deja igual que estaba para que la proxima corrida lo reintente.
      const accion = resolverAccionAutomatica(result.estadoActual);
      let accionOk = true;
      if (accion) {
        const { error: rpcErr } = await admin.rpc(accion, { p_order_id: pedido.id });
        if (rpcErr) {
          accionOk = false;
          errores++;
          await admin.from('shipment_settlement_logs').insert({ order_id: pedido.id, profile_id: null, data: { accion, error: rpcErr.message }, status: 0 });
        } else {
          accionesAutomaticas++;
        }
      }

      await admin.from('orders').update({
        tracking_status: accionOk ? result.estadoActual : (pedido.tracking_status ?? null),
        tracking_history: result.eventos,
        tracking_synced_at: new Date().toISOString(),
        // Fase 0 del plan de reduccion de devoluciones: motivo automatico solo cuando de verdad se
        // rechazo el pedido (accionOk evita guardar un motivo de una accion que en realidad fallo).
        ...(accionOk && accion === 'reject_order' ? { return_reason: resolverMotivoDevolucion(result.estadoActual) } : {}),
      }).eq('id', pedido.id);
      if (accionOk) actualizados++;

      await sleep(ESPERA_ENTRE_LLAMADOS_MS);
    }

    return json({ procesados: pendientes.length, actualizados, errores, acciones_automaticas: accionesAutomaticas });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
