// Proxy de /getLocations de Mipaquete (con cache en memoria por 1h) para el buscador de ciudad
// destino en el panel admin. Query param: q (texto a buscar).
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MipaqueteLocation {
  locationName: string;
  departmentOrStateName: string;
  locationCode: string;
}

let CACHE: MipaqueteLocation[] | null = null;
let CACHE_AT = 0;
const CACHE_TTL_MS = 60 * 60 * 1000;

async function loadLocations(): Promise<MipaqueteLocation[]> {
  const now = Date.now();
  if (CACHE && (now - CACHE_AT) < CACHE_TTL_MS) return CACHE;

  const apiKey = Deno.env.get('MIPAQUETE_API_KEY') ?? '';
  if (!apiKey) throw new Error('MIPAQUETE_API_KEY no configurada');

  const resp = await fetch('https://api.mipaquete.com/getLocations?countryId=CO', {
    headers: { apikey: apiKey, 'session-tracker': crypto.randomUUID() },
  });
  if (!resp.ok) throw new Error(`Mipaquete ${resp.status}: ${await resp.text()}`);

  const data = (await resp.json()) as MipaqueteLocation[];
  CACHE = Array.isArray(data) ? data : [];
  CACHE_AT = now;
  return CACHE;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    let q = '';
    const url = new URL(req.url);
    if (req.method === 'GET') {
      q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    } else {
      try {
        const body = await req.json();
        q = String(body?.q ?? '').trim().toLowerCase();
      } catch { /* body vacio */ }
    }

    const all = await loadLocations();
    let result = all;
    if (q.length >= 2) {
      const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const qn = norm(q);
      result = all.filter((l) => norm(l.locationName).includes(qn) || norm(l.departmentOrStateName).includes(qn));
    }

    const mapped = result.slice(0, 30).map((l) => ({
      name: `${l.locationName}, ${l.departmentOrStateName}`,
      code: l.locationCode,
    }));

    return new Response(JSON.stringify({ success: true, data: mapped }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return new Response(JSON.stringify({ success: false, error: message }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
