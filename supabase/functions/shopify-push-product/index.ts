// Sincroniza un producto de LokomproAqui hacia la tienda Shopify real de un vendedor, cuando la
// tiene conectada (shopify_connections). Disparado desde el boton "Agregar a mi Tienda" /
// "Actualizar Precio" / "Quitar de mi Tienda" de ViewProductosModal (ver lib/shopify.ts), siempre
// DESPUES de que el price_override interno ya se guardo -- si el vendedor no tiene Shopify
// conectado, esto es un no-op silencioso (skipped:'no_shopify'), nunca bloquea el flujo normal.
//
// Entrada: { action: 'upsert', profile_id, product_id, price } | { action: 'delete', profile_id, product_id }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const API_VERSION = '2024-01';

interface VariantRow {
  id: number;
  color: string | null;
  stock: number;
  images: string[] | null;
  size_label: string | null;
  sizes: { name: string } | null;
}

function skuDe(productId: number, variantId: number): string {
  return `LKA-${productId}-${variantId}`;
}

function tallaDe(v: VariantRow): string {
  return (v.sizes && v.sizes.name) || v.size_label || 'Unica';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const action = body.action === 'delete' ? 'delete' : 'upsert';
    const profileId = body.profile_id;
    const productId = Number(body.product_id);
    if (!profileId || !productId) return json({ ok: false, error: 'faltan_datos' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: conn } = await admin
      .from('shopify_connections')
      .select('shop_domain, access_token')
      .eq('profile_id', profileId)
      .eq('active', true)
      .maybeSingle();
    if (!conn) return json({ ok: true, skipped: 'no_shopify' }, 200);

    const { data: overrideRow } = await admin
      .from('price_overrides')
      .select('id, shopify_product_id, shopify_variant_map')
      .eq('profile_id', profileId)
      .eq('product_id', productId)
      .maybeSingle();

    const headers = { 'X-Shopify-Access-Token': conn.access_token, 'Content-Type': 'application/json' };

    if (action === 'delete') {
      if (overrideRow?.shopify_product_id) {
        const resp = await fetch(`https://${conn.shop_domain}/admin/api/${API_VERSION}/products/${overrideRow.shopify_product_id}.json`, {
          method: 'DELETE',
          headers,
        });
        // 404 = ya no existe alla (el vendedor pudo haberlo borrado el mismo) -- se trata igual como exito.
        if (!resp.ok && resp.status !== 404) {
          const detail = await resp.text().catch(() => '');
          return json({ ok: false, error: 'shopify_fallo', detalle: detail.slice(0, 300) }, 200);
        }
        await admin.from('price_overrides').update({ shopify_product_id: null, shopify_variant_map: {}, shopify_handle: null }).eq('id', overrideRow.id);
        await admin.from('shopify_sku_map').delete().eq('profile_id', profileId).eq('product_id', productId);
      }
      return json({ ok: true }, 200);
    }

    // action === 'upsert'
    const price = Number(body.price);
    if (!price) return json({ ok: false, error: 'precio_invalido' }, 400);

    const { data: product } = await admin
      .from('products')
      .select('id, name, description, short_description, image_url, variant1_label, variant2_label, categories:categories!products_category_id_fkey(name), product_variants(id, color, stock, images, size_label, sizes(name))')
      .eq('id', productId)
      .single();
    if (!product) return json({ ok: false, error: 'producto_no_encontrado' }, 404);

    const variantes: VariantRow[] = (product.product_variants || []) as unknown as VariantRow[];
    if (!variantes.length) return json({ ok: false, error: 'producto_sin_variantes' }, 400);

    const hayColor = variantes.some((v) => v.color);
    const haySize = variantes.some((v) => (v.sizes && v.sizes.name) || v.size_label);

    const variantMapPrevio: Record<string, number> = (overrideRow?.shopify_variant_map as Record<string, number>) || {};

    const variantsPayload = variantes.map((v) => {
      const obj: Record<string, unknown> = {
        sku: skuDe(productId, v.id),
        price: String(price),
        inventory_management: null,
      };
      let optIdx = 1;
      if (hayColor) obj[`option${optIdx++}`] = v.color || 'Unico';
      if (haySize) obj[`option${optIdx++}`] = tallaDe(v);
      if (!hayColor && !haySize) obj.option1 = 'Default Title';
      const shopifyVariantId = variantMapPrevio[String(v.id)];
      if (shopifyVariantId) obj.id = shopifyVariantId;
      return obj;
    });

    const imagenes = Array.from(
      new Set(variantes.flatMap((v) => (v.images && v.images.length ? v.images : [])).concat(product.image_url ? [product.image_url] : [])),
    ).map((src) => ({ src }));

    const options: { name: string; values: string[] }[] = [];
    if (hayColor) options.push({ name: product.variant1_label || 'Color', values: Array.from(new Set(variantes.map((v) => v.color || 'Unico'))) });
    if (haySize) options.push({ name: product.variant2_label || 'Talla', values: Array.from(new Set(variantes.map(tallaDe))) });

    let shopifyProduct: any;

    if (overrideRow?.shopify_product_id) {
      // Ya existe: pedido explicito del usuario 2026-07-27 -- solo se sincroniza el PRECIO en las
      // actualizaciones (no se resetean titulo/imagenes/opciones, por si el vendedor ya los
      // personalizo directamente en su Shopify).
      const resp = await fetch(`https://${conn.shop_domain}/admin/api/${API_VERSION}/products/${overrideRow.shopify_product_id}.json`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ product: { id: Number(overrideRow.shopify_product_id), variants: variantsPayload } }),
      });
      if (!resp.ok) {
        const detail = await resp.text().catch(() => '');
        return json({ ok: false, error: 'shopify_fallo', detalle: detail.slice(0, 300) }, 200);
      }
      shopifyProduct = (await resp.json()).product;
    } else {
      const resp = await fetch(`https://${conn.shop_domain}/admin/api/${API_VERSION}/products.json`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          product: {
            title: product.name,
            body_html: product.description || product.short_description || '',
            vendor: 'LokomproAqui',
            product_type: (product.categories as { name?: string } | null)?.name || '',
            status: 'active',
            images: imagenes,
            options: options.length ? options : undefined,
            variants: variantsPayload,
          },
        }),
      });
      if (!resp.ok) {
        const detail = await resp.text().catch(() => '');
        return json({ ok: false, error: 'shopify_fallo', detalle: detail.slice(0, 300) }, 200);
      }
      shopifyProduct = (await resp.json()).product;
    }

    const nuevoVariantMap: Record<string, number> = {};
    const skuRows: { profile_id: string; shopify_sku: string; product_id: number; product_variant_id: number }[] = [];
    for (const v of shopifyProduct.variants || []) {
      const match = String(v.sku || '').match(/^LKA-\d+-(\d+)$/);
      if (!match) continue;
      const nuestroVariantId = Number(match[1]);
      nuevoVariantMap[String(nuestroVariantId)] = v.id;
      skuRows.push({ profile_id: profileId, shopify_sku: v.sku, product_id: productId, product_variant_id: nuestroVariantId });
    }

    await admin
      .from('price_overrides')
      .update({ shopify_product_id: String(shopifyProduct.id), shopify_variant_map: nuevoVariantMap, shopify_handle: shopifyProduct.handle || null })
      .eq('profile_id', profileId)
      .eq('product_id', productId);

    if (skuRows.length) {
      await admin.from('shopify_sku_map').upsert(skuRows, { onConflict: 'profile_id,shopify_sku' });
    }

    return json({ ok: true, shopify_product_id: shopifyProduct.id }, 200);
  } catch (e) {
    return json({ ok: false, error: String(e) }, 200);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
