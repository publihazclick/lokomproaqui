// Conecta la tienda de WooCommerce de un dropshipper: valida las claves de la API REST, registra el
// webhook de "order.created" apuntando a woocommerce-webhook, y guarda la conexion.
// Entrada: { action: 'connect', profile_id, store_url, consumer_key, consumer_secret }
//        | { action: 'disconnect', profile_id }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizeStoreUrl(input: string): string {
  let url = String(input || '').trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, '');
}

function basicAuthHeader(consumerKey: string, consumerSecret: string): string {
  return 'Basic ' + btoa(`${consumerKey}:${consumerSecret}`);
}

function randomSecret(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const action = body.action || 'connect';
    const profileId = body.profile_id;
    if (!profileId) return json({ error: 'profile_id es requerido' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    if (action === 'disconnect') {
      const { data: existing } = await admin.from('woocommerce_connections').select('*').eq('profile_id', profileId).maybeSingle();
      if (existing && existing.woocommerce_webhook_id) {
        await fetch(`${existing.store_url}/wp-json/wc/v3/webhooks/${existing.woocommerce_webhook_id}?force=true`, {
          method: 'DELETE',
          headers: { Authorization: basicAuthHeader(existing.consumer_key, existing.consumer_secret) },
        }).catch(() => {});
      }
      await admin.from('woocommerce_connections').delete().eq('profile_id', profileId);
      return json({ status: 'ok' });
    }

    const storeUrl = normalizeStoreUrl(body.store_url);
    const consumerKey = String(body.consumer_key || '').trim();
    const consumerSecret = String(body.consumer_secret || '').trim();
    if (!storeUrl || !consumerKey || !consumerSecret) {
      return json({ error: 'Faltan datos: URL de la tienda, consumer key o consumer secret' }, 400);
    }

    const authHeader = basicAuthHeader(consumerKey, consumerSecret);

    // 1. Validar las claves listando los webhooks existentes (tambien sirve para reutilizar uno ya creado).
    const listResp = await fetch(`${storeUrl}/wp-json/wc/v3/webhooks?per_page=100`, {
      headers: { Authorization: authHeader },
    });
    if (!listResp.ok) {
      const detail = await listResp.text().catch(() => '');
      return json({ error: 'La URL de la tienda o las claves de la API REST no son validas', detail: detail.slice(0, 300) }, 400);
    }

    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/woocommerce-webhook`;
    const listData = await listResp.json().catch(() => []);
    const existingHook = Array.isArray(listData)
      ? listData.find((w: any) => w.delivery_url === webhookUrl && w.topic === 'order.created')
      : null;

    let webhookId: string | number | null = null;
    const webhookSecret = randomSecret();

    if (existingHook) {
      // Reutilizamos el webhook existente pero le renovamos el secret para poder verificarlo nosotros.
      const updateResp = await fetch(`${storeUrl}/wp-json/wc/v3/webhooks/${existingHook.id}`, {
        method: 'PUT',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active', secret: webhookSecret }),
      });
      if (!updateResp.ok) {
        const detail = await updateResp.text().catch(() => '');
        return json({ error: 'No se pudo actualizar el webhook de pedidos en WooCommerce', detail: detail.slice(0, 300) }, 502);
      }
      webhookId = existingHook.id;
    } else {
      const createResp = await fetch(`${storeUrl}/wp-json/wc/v3/webhooks`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'LokomproAqui - Pedidos nuevos',
          topic: 'order.created',
          delivery_url: webhookUrl,
          secret: webhookSecret,
        }),
      });
      if (!createResp.ok) {
        const detail = await createResp.text().catch(() => '');
        return json({ error: 'No se pudo registrar el webhook de pedidos en WooCommerce', detail: detail.slice(0, 300) }, 502);
      }
      const createData = await createResp.json();
      webhookId = createData?.id ?? null;
    }

    // 2. Guardar la conexion.
    const { error: upsertErr } = await admin.from('woocommerce_connections').upsert({
      profile_id: profileId,
      store_url: storeUrl,
      consumer_key: consumerKey,
      consumer_secret: consumerSecret,
      woocommerce_webhook_id: webhookId != null ? String(webhookId) : null,
      webhook_secret: webhookSecret,
      active: true,
      connected_at: new Date().toISOString(),
    }, { onConflict: 'profile_id' });

    if (upsertErr) return json({ error: 'No se pudo guardar la conexion', detail: upsertErr.message }, 500);

    return json({ status: 'ok', store_url: storeUrl });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
