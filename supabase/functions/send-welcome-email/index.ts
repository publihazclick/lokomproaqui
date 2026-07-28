const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Pedido explicito del usuario 2026-07-27 (segunda vuelta): el admin escribe el contenido como
// TEXTO PLANO normal en /config/configuracion (saltos de linea reales, links pegados tal cual), sin
// tener que saber HTML -- esta funcion es la unica responsable de convertirlo a HTML bien formado.
const DEFAULT_ASUNTO_VENDEDOR = '¡Bienvenido a LokomproAqui! Ya puedes empezar a vender';
const DEFAULT_TEXTO_VENDEDOR = `Hola {{nombre}},

Tu cuenta de vendedor en LokomproAqui ya está activa.

Ahora puedes:
- Explorar el catálogo de productos de nuestros proveedores
- Elegir los productos que quieres vender y armar tu tienda
- Empezar a recibir pedidos y ganar comisiones por cada venta

Entra a tu catálogo aquí: https://lokomproaqui.com/articulo

Si tienes dudas, escríbenos por WhatsApp desde el sitio y con gusto te ayudamos.

LokomproAqui · lokomproaqui.com`;

const DEFAULT_ASUNTO_PROVEEDOR = '¡Bienvenido a LokomproAqui! Activa tu bodega en 3 pasos';
const DEFAULT_TEXTO_PROVEEDOR = `Hola {{nombre}},

Tu cuenta de proveedor (bodega) en LokomproAqui ya está creada.

Para que miles de vendedores puedan encontrar y vender tus productos, te falta:
1. Subir mínimo 3 productos a tu catálogo
2. Enviar tu bodega a revisión
3. Esperar la aprobación de nuestro equipo (usualmente rápida)

Sube tus productos aquí: https://lokomproaqui.com/config/productos

Si tienes dudas, escríbenos por WhatsApp desde el sitio y con gusto te ayudamos.

LokomproAqui · lokomproaqui.com`;

const HTML_WRAP = (inner: string) =>
  `<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2937; line-height: 1.5;">${inner}</div>`;

// Convierte el texto plano que escribe el admin a HTML: escapa caracteres especiales (para que un
// "<" o "&" que alguien escriba por error no rompa el correo), convierte lineas en blanco en
// parrafos separados y saltos de linea sueltos en <br>, y vuelve clicable cualquier link que
// empiece por http(s):// tal cual como lo pego el admin.
function textoAHtml(texto: string): string {
  const escapado = texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  return escapado
    .split(/\n\s*\n/)
    .map((parrafo) => `<p>${parrafo.replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

// Trae la plantilla configurada por el admin en /config/configuracion (site_config.info_text), con
// respaldo a la plantilla de fabrica si el admin nunca la toco o si la consulta falla por cualquier
// motivo -- el correo de bienvenida nunca debe dejar de enviarse por un problema al leer site_config.
async function fetchPlantilla(rol: 'vendedor' | 'proveedor'): Promise<{ subject: string; texto: string }> {
  const defaults =
    rol === 'proveedor'
      ? { subject: DEFAULT_ASUNTO_PROVEEDOR, texto: DEFAULT_TEXTO_PROVEEDOR }
      : { subject: DEFAULT_ASUNTO_VENDEDOR, texto: DEFAULT_TEXTO_VENDEDOR };

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
    // OJO: la clave en site_config sigue llamandose "emailHtml..." por continuidad con el schema
    // existente, pero desde este cambio guarda TEXTO PLANO, no HTML.
    const textoKey = rol === 'proveedor' ? 'emailHtmlProveedor' : 'emailHtmlVendedor';
    return {
      subject: info[subjectKey] || defaults.subject,
      texto: info[textoKey] || defaults.texto,
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
    const textoConNombre = plantilla.texto.replaceAll('{{nombre}}', nombre);
    const html = HTML_WRAP(textoAHtml(textoConNombre));

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: resendFrom, to: email, subject: plantilla.subject, html, text: textoConNombre }),
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
