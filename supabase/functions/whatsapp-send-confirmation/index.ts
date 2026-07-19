// Fase 1d del plan de reduccion de devoluciones (pedido explicito del usuario 2026-07-19): manda
// la plantilla de confirmacion real de WhatsApp Business Cloud API (API OFICIAL de Meta, no
// Evolution API/Baileys -- se descarto ese camino por riesgo real de bloqueo, ver conversacion
// 2026-07-19) apenas se crea un pedido 'contraentrega' publico. Solo aplica a 'contraentrega'
// (dropshipping/muestra ya tienen al comprador negociado directo por el vendedor).
//
// DISEÑO AUTO-ACTIVABLE: si WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID todavia no estan
// configurados (la verificacion de negocio en Meta esta en curso al momento de escribir esto), esta
// funcion responde ok:false sin marcar nada en el pedido -- confirmation_status se queda en null, y
// autorizarDespacho() (FormVentaDetalleModal) solo bloquea pedidos con confirmation_status NO nulo
// y NO 'confirmed'. Cero riesgo de bloquear pedidos mientras las credenciales reales no existan.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TEMPLATE_NAME = 'confirmacion_pedido_lokomproaqui';
const TEMPLATE_LANG = 'es';

function normalizarTelefono(raw: string | null): string | null {
  const digitos = (raw || '').replace(/\D/g, '');
  const ultimos10 = digitos.slice(-10);
  if (ultimos10.length < 10) return null;
  return `57${ultimos10}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const orderId = body.order_id;
    if (!orderId) return json({ ok: false, error: 'order_id requerido' }, 400);

    const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
    if (!accessToken || !phoneNumberId) {
      // No configurado todavia -- no-op silencioso a proposito, ver nota arriba.
      return json({ ok: false, error: 'whatsapp_no_configurado' }, 200);
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: order, error: orderErr } = await admin
      .from('orders')
      .select('id, order_type, buyer_name, buyer_phone, buyer_address, buyer_city, price_total, order_items(title, quantity)')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) return json({ ok: false, error: 'pedido_no_encontrado' }, 404);
    if (order.order_type !== 'contraentrega') return json({ ok: false, error: 'no_aplica_para_este_tipo_de_pedido' }, 200);

    const telefono = normalizarTelefono(order.buyer_phone);
    if (!telefono) {
      await admin.from('orders').update({ confirmation_status: 'invalid_number' }).eq('id', orderId);
      return json({ ok: false, error: 'telefono_invalido' }, 200);
    }

    const items = (order as any).order_items || [];
    const resumenProductos = items.map((i: any) => `${i.title} x${i.quantity}`).join(', ') || 'Tu pedido';
    const totalFormateado = `$${Math.round(Number(order.price_total) || 0).toLocaleString('es-CO')}`;
    const direccion = `${order.buyer_address || ''}, ${order.buyer_city || ''}`.trim();

    const payload = {
      messaging_product: 'whatsapp',
      to: telefono,
      type: 'template',
      template: {
        name: TEMPLATE_NAME,
        language: { code: TEMPLATE_LANG },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: order.buyer_name || 'Cliente' },
              { type: 'text', text: resumenProductos },
              { type: 'text', text: totalFormateado },
              { type: 'text', text: direccion || 'tu dirección' },
            ],
          },
        ],
      },
    };

    const resp = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await resp.text();
    if (!resp.ok) {
      return json({ ok: false, error: 'meta_api_error', status: resp.status, detail: text.slice(0, 500) }, 200);
    }

    let parsed: any;
    try { parsed = JSON.parse(text); } catch { parsed = {}; }
    const messageId = parsed?.messages?.[0]?.id || null;

    await admin.from('orders').update({
      confirmation_status: 'pending',
      confirmation_sent_at: new Date().toISOString(),
      confirmation_message_id: messageId,
    }).eq('id', orderId);

    return json({ ok: true, message_id: messageId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return json({ ok: false, error: message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
