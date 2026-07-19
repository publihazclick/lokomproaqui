// Genera una URL de subida FIRMADA para el bucket privado `acelerador-videos`. Existe porque
// el servicio de Storage de Supabase en este proyecto NO reconoce la sesion del usuario para
// buckets privados (bug real de la plataforma, confirmado 2026-07-15: la misma sesion que
// funciona perfecto via /rest/v1/rpc falla siempre via /storage/v1/object -- ver memoria
// lokomproaqui-nextjs-migration). Una URL firmada evita el problema: se genera del lado del
// servidor con SERVICE_ROLE (que no depende de RLS ni de esa verificacion rota), y el browser
// sube el archivo directo a esa URL despues, con progreso real via XHR.
//
// Solo el mentor puede pedir una URL de subida -- es la unica barrera real de quien puede
// escribir contenido del curso (mismo criterio que acelerador-signed-url para la lectura).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader) return json({ error: 'No autenticado' }, 401);

    const body = await req.json();
    const path = body.path;
    if (!path || typeof path !== 'string' || !path.startsWith('lecciones/')) {
      return json({ error: 'path invalido' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const asCaller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await asCaller.auth.getUser();
    if (userErr || !userData || !userData.user) return json({ error: 'No autenticado' }, 401);

    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: profile } = await admin.from('profiles').select('roles(name)').eq('id', userData.user.id).single();
    if ((profile as any)?.roles?.name !== 'mentor') return json({ error: 'No autorizado' }, 403);

    const { data: signed, error: signErr } = await admin.storage.from('acelerador-videos').createSignedUploadUrl(path);
    if (signErr || !signed) return json({ error: signErr?.message || 'No se pudo generar el link de subida' }, 500);

    return json({ signedUrl: signed.signedUrl, token: signed.token, path: signed.path });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
