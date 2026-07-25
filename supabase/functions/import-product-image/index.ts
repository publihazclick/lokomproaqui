// Carga masiva de productos (Excel/CSV, pedido explicito del usuario 2026-07-25): el proveedor
// pone la URL de la foto en la plantilla -- el navegador no puede descargar bytes de un dominio
// externo con fetch() por CORS (la mayoria de hosts de imagenes no manda los headers necesarios),
// asi que esta funcion la descarga del lado del servidor (Deno no tiene esa restriccion) y la
// resube al mismo bucket publico que ya usa subirArchivoPublico() en el cliente.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_BYTES = 8 * 1024 * 1024; // 8MB, mismo criterio razonable que una foto de producto normal

function extensionParaTipo(contentType: string): string {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  return 'jpg';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { url } = await req.json();
    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ error: 'Falta la URL de la foto' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let resp: Response;
    try {
      // Algunos hosts (ej. Wikimedia) rechazan pedidos sin un User-Agent que parezca de verdad.
      resp = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LokomproAquiBot/1.0)' } });
    } catch {
      return new Response(JSON.stringify({ error: 'No pudimos abrir ese link' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: `El link de la foto respondió con error (${resp.status})` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const contentType = resp.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return new Response(JSON.stringify({ error: 'Ese link no es una imagen directa (revisa que abra la foto sola, no una página)' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const bytes = new Uint8Array(await resp.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) {
      return new Response(JSON.stringify({ error: 'La foto pesa demasiado (máximo 8MB)' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const path = `uploads/importadas/${Date.now()}-${Math.random().toString(36).slice(2)}.${extensionParaTipo(contentType)}`;
    const { error: uploadError } = await supabase.storage.from('lokomproaqui-media').upload(path, bytes, { contentType, upsert: true });
    if (uploadError) {
      return new Response(JSON.stringify({ error: 'No pudimos guardar la foto' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data } = supabase.storage.from('lokomproaqui-media').getPublicUrl(path);
    return new Response(JSON.stringify({ url: data.publicUrl }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Error inesperado' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
