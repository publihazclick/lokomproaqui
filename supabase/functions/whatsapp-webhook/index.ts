// Fase 1d del plan de reduccion de devoluciones: recibe los eventos de WhatsApp Business Cloud API
// (API oficial de Meta) -- el handshake de verificacion (GET) y las respuestas reales del comprador
// (POST): boton "Si, confirmar"/"Cancelar pedido", o el estado "failed" cuando el numero no existe/
// no tiene WhatsApp. Se despliega publica (--no-verify-jwt, mismo patron que epayco-webhook) porque
// Meta la llama directo, sin sesion de usuario de por medio.
//
// Correlacion por confirmation_message_id (NO por telefono+"pedido pendiente mas reciente"): Meta
// manda `context.id` = el id del mensaje original al que el comprador respondio, que es exactamente
// el mismo id que whatsapp-send-confirmation guardo al enviar la plantilla -- funciona bien incluso
// si el mismo comprador tiene 2 pedidos pendientes de confirmar a la vez.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function verificarFirma(rawBody: string, signatureHeader: string | null, appSecret: string): Promise<boolean> {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const esperado = signatureHeader.slice('sha256='.length);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const firma = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const calculado = Array.from(new Uint8Array(firma)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return calculado === esperado;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Handshake de verificacion de Meta (una sola vez, al configurar la URL del webhook en el panel).
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const verifyToken = Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
    if (mode === 'subscribe' && verifyToken && token === verifyToken) {
      return new Response(challenge || '', { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method !== 'POST') return new Response('ok', { headers: corsHeaders });

  try {
    const rawBody = await req.text();
    const appSecret = Deno.env.get('WHATSAPP_APP_SECRET');
    // Si el secret todavia no esta configurado (credenciales de Meta en proceso), se procesa sin
    // verificar -- este endpoint no puede validar nada de otra forma en ese estado, y no hay nada
    // real conectado todavia que se pueda atacar. Apenas WHATSAPP_APP_SECRET exista, la firma se
    // verifica siempre.
    if (appSecret) {
      const valido = await verificarFirma(rawBody, req.headers.get('x-hub-signature-256'), appSecret);
      if (!valido) return new Response('Invalid signature', { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};

        // Respuestas de boton (Si/Cancelar).
        for (const msg of value.messages || []) {
          if (msg.type !== 'button' || !msg.context?.id) continue;
          const textoBoton = (msg.button?.text || '').toLowerCase();

          const { data: order } = await admin.from('orders').select('id, status').eq('confirmation_message_id', msg.context.id).maybeSingle();
          if (!order) continue;

          if (textoBoton.includes('confirmar') || textoBoton.includes('si')) {
            await admin.from('orders').update({ confirmation_status: 'confirmed' }).eq('id', order.id);
          } else if (textoBoton.includes('cancelar')) {
            // Pre-guia todavia (nunca se cobro nada de wallet en este punto) -- solo se marca
            // rechazado + el motivo real, mismo patron que marcarPedidoRechazadoSinReembolso
            // (no hay nada que reembolsar aca, el flujo de fletes nunca llego a esta etapa).
            await admin.from('orders').update({ confirmation_status: 'cancelled', status: 'rejected', return_reason: 'se_arrepintio' }).eq('id', order.id);
          }
        }

        // Estados de entrega -- "failed" es la señal real de numero invalido/sin WhatsApp.
        for (const status of value.statuses || []) {
          if (status.status !== 'failed') continue;
          await admin.from('orders').update({ confirmation_status: 'invalid_number' }).eq('confirmation_message_id', status.id);
        }
      }
    }

    return json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return json({ ok: false, error: message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
