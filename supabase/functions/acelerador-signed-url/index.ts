// Barrera real de seguridad del curso "Acelerador de Ventas": el video nunca tiene una URL
// publica/permanente (bucket privado `acelerador-videos`, sin politica de select). Esta funcion
// es la UNICA forma de obtener un link reproducible, y solo lo entrega si el JWT del que pide
// pertenece a un perfil con suscripcion vigente (acelerador_has_access). El guard de Angular
// (acelerador.guard.ts) es solo UX -- se salta con devtools -- esta funcion es lo que de verdad
// protege el archivo.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// URL firmada valida por 3 horas: suficiente para ver cualquier clase sin cortes, corta para
// que un link filtrado no sirva al dia siguiente.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 3;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader) return json({ error: 'No autenticado' }, 401);

    const body = await req.json();
    const lessonId = body.lesson_id;
    if (!lessonId) return json({ error: 'lesson_id requerido' }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Cliente "de sesion" (anon key + el JWT del que llama) solo para resolver quien es.
    const asCaller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await asCaller.auth.getUser();
    if (userErr || !userData || !userData.user) return json({ error: 'No autenticado' }, 401);

    // profiles.id === auth.users.id en este proyecto (confirmado en 002_auth_profiles.sql).
    const profileId = userData.user.id;

    // A partir de aca, siempre con service_role: ni la suscripcion ni el video deben depender
    // de RLS (que aqui es permisiva en las tablas de metadata, pero el bucket es privado).
    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: hasAccess, error: accessErr } = await admin.rpc('acelerador_has_access', { p_profile_id: profileId });
    if (accessErr) return json({ error: accessErr.message }, 500);

    let autorizado = !!hasAccess;
    if (!autorizado) {
      // El mentor sube y organiza el contenido: puede previsualizar cualquier leccion sin
      // necesitar (ni pagar) una suscripcion.
      const { data: profile } = await admin.from('profiles').select('roles(name)').eq('id', profileId).single();
      autorizado = (profile as any)?.roles?.name === 'mentor';
    }
    if (!autorizado) return json({ error: 'Suscripcion no vigente' }, 403);

    const { data: lesson, error: lessonErr } = await admin
      .from('acelerador_lessons').select('video_path').eq('id', lessonId).single();
    if (lessonErr || !lesson) return json({ error: 'Leccion no encontrada' }, 404);

    const { data: signed, error: signErr } = await admin
      .storage.from('acelerador-videos').createSignedUrl(lesson.video_path, SIGNED_URL_TTL_SECONDS);
    if (signErr || !signed) return json({ error: 'No se pudo generar el link del video' }, 500);

    return json({ url: signed.signedUrl, expires_in: SIGNED_URL_TTL_SECONDS });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
