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

    for (const pedido of pendientes) {
      const result = await fetchTracking(pedido.mipaquete_shipment_id, apiKey);
      if (!result.ok) {
        errores++;
      } else {
        await admin.from('orders').update({
          tracking_status: result.estadoActual,
          tracking_history: result.eventos,
          tracking_synced_at: new Date().toISOString(),
        }).eq('id', pedido.id);
        actualizados++;
      }
      await sleep(ESPERA_ENTRE_LLAMADOS_MS);
    }

    return json({ procesados: pendientes.length, actualizados, errores });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
