const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_ASUNTO_VENDEDOR = '¡Bienvenido a LokomproAqui! Ya puedes empezar a vender';
const DEFAULT_HTML_VENDEDOR = `<p>Hola {{nombre}},</p>
<p>Tu cuenta de <strong>vendedor</strong> en LokomproAqui ya está activa.</p>
<p>Ahora puedes:</p>
<ul>
  <li>Explorar el catálogo de productos de nuestros proveedores</li>
  <li>Elegir los productos que quieres vender y armar tu tienda</li>
  <li>Empezar a recibir pedidos y ganar comisiones por cada venta</li>
</ul>
<p>Entra a tu catálogo aquí: <a href="https://lokomproaqui.com/articulo">https://lokomproaqui.com/articulo</a></p>
<p>Si tienes dudas, escríbenos por WhatsApp desde el sitio y con gusto te ayudamos.</p>
<p style="color: #6b7280; font-size: 12px; margin-top: 24px;">LokomproAqui · lokomproaqui.com</p>`;

const DEFAULT_ASUNTO_PROVEEDOR = '¡Bienvenido a LokomproAqui! Activa tu bodega en 3 pasos';
const DEFAULT_HTML_PROVEEDOR = `<p>Hola {{nombre}},</p>
<p>Tu cuenta de <strong>proveedor</strong> (bodega) en LokomproAqui ya está creada.</p>
<p>Para que miles de vendedores puedan encontrar y vender tus productos, te falta:</p>
<ol>
  <li>Subir mínimo <strong>3 productos</strong> a tu catálogo</li>
  <li>Enviar tu bodega a revisión</li>
  <li>Esperar la aprobación de nuestro equipo (usualmente rápida)</li>
</ol>
<p>Sube tus productos aquí: <a href="https://lokomproaqui.com/config/productos">https://lokomproaqui.com/config/productos</a></p>
<p>Si tienes dudas, escríbenos por WhatsApp desde el sitio y con gusto te ayudamos.</p>
<p style="color: #6b7280; font-size: 12px; margin-top: 24px;">LokomproAqui · lokomproaqui.com</p>`;

const HTML_WRAP = (inner: string) =>
  `<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2937; line-height: 1.5;">${inner}</div>`;

// Version texto plano generada a partir del HTML (propio o el que el admin haya editado en
// /config/configuracion) -- solo un respaldo de compatibilidad para clientes de correo viejos, no
// necesita ser perfecta. Reemplaza <br>/cierres de bloque por saltos de linea antes de quitar el
// resto de etiquetas, y "desescapa" las entidades HTML mas comunes.
function htmlATexto(html: string): string {
  return html
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Trae la plantilla configurada por el admin en /config/configuracion (site_config.info_text), con
// respaldo a la plantilla de fabrica si el admin nunca la toco o si la consulta falla por cualquier
// motivo -- el correo de bienvenida nunca debe dejar de enviarse por un problema al leer site_config.
async function fetchPlantilla(rol: 'vendedor' | 'proveedor'): Promise<{ subject: string; html: string }> {
  const defaults =
    rol === 'proveedor'
      ? { subject: DEFAULT_ASUNTO_PROVEEDOR, html: DEFAULT_HTML_PROVEEDOR }
      : { subject: DEFAULT_ASUNTO_VENDEDOR, html: DEFAULT_HTML_VENDEDOR };

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return defaults;

  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/site_config?select=info_text&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    if (!resp.ok) return defaults;
    const rows = await resp.json();
    const info = rows?.[0]?.info_text || {};
    const subjectKey = rol === 'proveedor' ? 'emailAsuntoProveedor' : 'emailAsuntoVendedor';
    const htmlKey = rol === 'proveedor' ? 'emailHtmlProveedor' : 'emailHtmlVendedor';
    return {
      subject: info[subjectKey] || defaults.subject,
      html: info[htmlKey] || defaults.html,
    };
  } catch {
    return defaults;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const email = (body.email || '').trim();
    const nombre = (body.nombre || 'usuario').trim();
    const rol = body.rol === 'proveedor' ? 'proveedor' : 'vendedor';
    if (!email) return json({ ok: false, error: 'email_requerido' }, 400);

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const resendFrom = Deno.env.get('RESEND_FROM');
    if (!resendApiKey || !resendFrom) {
      // No configurado todavia -- no-op silencioso, mismo patron que whatsapp-send-confirmation.
      return json({ ok: false, error: 'email_no_configurado' }, 200);
    }

    const plantilla = await fetchPlantilla(rol);
    const htmlConNombre = plantilla.html.replaceAll('{{nombre}}', nombre);
    const html = HTML_WRAP(htmlConNombre);
    const text = htmlATexto(htmlConNombre);

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: resendFrom, to: email, subject: plantilla.subject, html, text }),
    });

    if (!resp.ok) {
      const detalle = await resp.text();
      return json({ ok: false, error: 'resend_fallo', detalle }, 200);
    }

    return json({ ok: true }, 200);
  } catch (e) {
    return json({ ok: false, error: String(e) }, 200);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
