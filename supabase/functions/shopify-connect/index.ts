// Conecta la tienda de Shopify de un dropshipper: valida el token, registra el webhook
// de "orders/create" apuntando a shopify-webhook, y guarda la conexion.
// Entrada: { action: 'connect', profile_id, shop_domain, access_token, api_secret }
//        | { action: 'disconnect', profile_id }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const API_VERSION = '2024-01';

function normalizeShopDomain(input: string): string {
  let domain = String(input || '').trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!domain.endsWith('.myshopify.com')) domain = `${domain}.myshopify.com`;
  return domain;
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
      const { data: existing } = await admin.from('shopify_connections').select('*').eq('profile_id', profileId).maybeSingle();
      if (existing && existing.shopify_webhook_id) {
        await fetch(`https://${existing.shop_domain}/admin/api/${API_VERSION}/webhooks/${existing.shopify_webhook_id}.json`, {
          method: 'DELETE',
          headers: { 'X-Shopify-Access-Token': existing.access_token },
        }).catch(() => {});
      }
      await admin.from('shopify_connections').delete().eq('profile_id', profileId);
      return json({ status: 'ok' });
    }

    const shopDomain = normalizeShopDomain(body.shop_domain);
    const accessToken = String(body.access_token || '').trim();
    const apiSecret = String(body.api_secret || '').trim();
    if (!shopDomain || !accessToken || !apiSecret) {
      return json({ error: 'Faltan datos: dominio de la tienda, token de acceso o client secret' }, 400);
    }

    // 1. Validar el token contra la tienda real.
    const shopResp = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/shop.json`, {
      headers: { 'X-Shopify-Access-Token': accessToken },
    });
    if (!shopResp.ok) {
      const detail = await shopResp.text().catch(() => '');
      return json({ error: 'El dominio de la tienda o el token de acceso no son validos', detail: detail.slice(0, 300) }, 400);
    }

    // 2. Registrar (o reutilizar) el webhook de pedidos nuevos.
    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/shopify-webhook`;

    const listResp = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/webhooks.json?topic=orders/create`, {
      headers: { 'X-Shopify-Access-Token': accessToken },
    });
    let webhookId: string | number | null = null;
    if (listResp.ok) {
      const listData = await listResp.json();
      const existingHook = (listData.webhooks || []).find((w: any) => w.address === webhookUrl);
      if (existingHook) webhookId = existingHook.id;
    }

    if (!webhookId) {
      const createResp = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/webhooks.json`, {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhook: { topic: 'orders/create', address: webhookUrl, format: 'json' } }),
      });
      if (!createResp.ok) {
        const detail = await createResp.text().catch(() => '');
        return json({ error: 'No se pudo registrar el webhook de pedidos en Shopify', detail: detail.slice(0, 300) }, 502);
      }
      const createData = await createResp.json();
      webhookId = createData?.webhook?.id ?? null;
    }

    // 3. Guardar la conexion.
    const { error: upsertErr } = await admin.from('shopify_connections').upsert({
      profile_id: profileId,
      shop_domain: shopDomain,
      access_token: accessToken,
      api_secret: apiSecret,
      shopify_webhook_id: webhookId != null ? String(webhookId) : null,
      active: true,
      connected_at: new Date().toISOString(),
    }, { onConflict: 'profile_id' });

    if (upsertErr) return json({ error: 'No se pudo guardar la conexion', detail: upsertErr.message }, 500);

    return json({ status: 'ok', shop_domain: shopDomain });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
