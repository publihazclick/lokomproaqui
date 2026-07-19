// Fase 1d del plan de reduccion de devoluciones: cron (cada 30 min, ver migracion 054) que hace
// seguimiento a las confirmaciones pendientes -- recordatorio a las 12h sin respuesta, cancelacion
// automatica a las 24h (sin haber gastado flete todavia, la devolucion mas barata de evitar es la
// que nunca llega a generar guia). Reenvia LA MISMA plantilla aprobada como recordatorio (evita
// necesitar una segunda plantilla aprobada por Meta solo para esto).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TEMPLATE_NAME = 'confirmacion_pedido_lokomproaqui';
const TEMPLATE_LANG = 'es';
const HORAS_RECORDATORIO = 12;
const HORAS_CANCELACION = 24;
const LIMITE_POR_CORRIDA = 50;

function normalizarTelefono(raw: string | null): string | null {
  const digitos = (raw || '').replace(/\D/g, '');
  const ultimos10 = digitos.slice(-10);
  if (ultimos10.length < 10) return null;
  return `57${ultimos10}`;
}

async function reenviarPlantilla(order: any, accessToken: string, phoneNumberId: string): Promise<string | null> {
  const telefono = normalizarTelefono(order.buyer_phone);
  if (!telefono) return null;

  const items = order.order_items || [];
  const resumenProductos = items.map((i: any) => `${i.title} x${i.quantity}`).join(', ') || 'Tu pedido';
  const totalFormateado = `$${Math.round(Number(order.price_total) || 0).toLocaleString('es-CO')}`;
  const direccion = `${order.buyer_address || ''}, ${order.buyer_city || ''}`.trim();

  const resp = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: telefono,
      type: 'template',
      template: {
        name: TEMPLATE_NAME,
        language: { code: TEMPLATE_LANG },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: order.buyer_name || 'Cliente' },
            { type: 'text', text: resumenProductos },
            { type: 'text', text: totalFormateado },
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
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');

    const ahora = Date.now();
    const topeRecordatorio = new Date(ahora - HORAS_RECORDATORIO * 60 * 60 * 1000).toISOString();
    const topeCancelacion = new Date(ahora - HORAS_CANCELACION * 60 * 60 * 1000).toISOString();

    // Cancelacion automatica primero: pendientes desde hace 24h+ (ya se les mando recordatorio hace
    // 12h+ y nunca respondieron).
    const { data: paraCancelar } = await admin
      .from('orders')
      .select('id')
      .eq('order_type', 'contraentrega')
      .eq('status', 'pending')
      .eq('confirmation_status', 'pending')
      .not('confirmation_reminder_sent_at', 'is', null)
      .lte('confirmation_reminder_sent_at', topeCancelacion)
      .limit(LIMITE_POR_CORRIDA);

    let cancelados = 0;
    for (const pedido of paraCancelar || []) {
      await admin.from('orders').update({ confirmation_status: 'cancelled', status: 'rejected', return_reason: 'no_contesto' }).eq('id', pedido.id);
      cancelados++;
    }

    let recordatorios = 0;
    if (accessToken && phoneNumberId) {
      const { data: paraRecordar } = await admin
        .from('orders')
        .select('id, buyer_name, buyer_phone, buyer_address, buyer_city, price_total, order_items(title, quantity)')
        .eq('order_type', 'contraentrega')
        .eq('status', 'pending')
        .eq('confirmation_status', 'pending')
        .is('confirmation_reminder_sent_at', null)
        .lte('confirmation_sent_at', topeRecordatorio)
        .limit(LIMITE_POR_CORRIDA);

      for (const pedido of paraRecordar || []) {
        const messageId = await reenviarPlantilla(pedido, accessToken, phoneNumberId);
        await admin.from('orders').update({
          confirmation_reminder_sent_at: new Date().toISOString(),
          ...(messageId ? { confirmation_message_id: messageId } : {}),
        }).eq('id', pedido.id);
        recordatorios++;
      }
    }

    return json({ recordatorios, cancelados });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
