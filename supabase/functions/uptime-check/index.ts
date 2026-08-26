// Cron cada 5 min (migracion 073) via pg_cron + pg_net, sin usuario de por medio -- publica
// (--no-verify-jwt, mismo motivo que mipaquete-sync-tracking/whatsapp-confirmation-followup).
// Chequea 2 objetivos (dominio custom vs. deploy directo de Vercel, ver comentario en la
// migracion) y avisa por email via Resend cuando alguno cambia de estado, o cada 60 min mientras
// siga caido (para no perder el aviso si el primer email fallara, y para no dejar una caida larga
// en silencio).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TIMEOUT_MS = 8000;
const FAILURE_THRESHOLD = 2; // no marcar "caido"/alertar por un solo blip transitorio
const REMINDER_MS = 60 * 60 * 1000; // recordatorio cada 1h mientras siga caido

interface CheckResult {
  ok: boolean;
  status: number | null;
  error: string | null;
  ms: number;
}

async function checkUrl(url: string): Promise<CheckResult> {
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow' });
    return { ok: res.ok, status: res.status, error: res.ok ? null : `HTTP ${res.status}`, ms: Date.now() - start };
  } catch (e) {
    return { ok: false, status: null, error: e instanceof Error ? e.message : String(e), ms: Date.now() - start };
  }
}

async function enviarAlerta(resendKey: string, from: string, to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  });
  return res.ok;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const resendKey = Deno.env.get('RESEND_API_KEY') ?? '';
    const resendFrom = Deno.env.get('RESEND_FROM') ?? 'LokomproAqui Monitor <onboarding@resend.dev>';
    const alertTo = Deno.env.get('UPTIME_ALERT_EMAIL') ?? '';

    const { data: filas, error: selectErr } = await admin.from('site_uptime_status').select('*');
    if (selectErr || !filas) return json({ error: selectErr?.message || 'sin filas' }, 500);

    const eventos: { target: string; tipo: 'down' | 'recovered' | 'reminder'; detalle: string }[] = [];
    const resumen: { target: string; ok: boolean; detalle: string }[] = [];

    for (const fila of filas) {
      const check = await checkUrl(fila.url);
      const ahora = new Date();
      resumen.push({ target: fila.target, ok: check.ok, detalle: check.ok ? `OK (${check.ms}ms)` : (check.error || 'error desconocido') });

      if (check.ok) {
        if (!fila.is_up) {
          eventos.push({ target: fila.target, tipo: 'recovered', detalle: `Volvió a responder (${check.ms}ms).` });
        }
        await admin.from('site_uptime_status').update({
          is_up: true,
          consecutive_failures: 0,
          last_checked_at: ahora.toISOString(),
          last_status_change_at: fila.is_up ? fila.last_status_change_at : ahora.toISOString(),
          last_alert_at: fila.is_up ? fila.last_alert_at : null,
          last_error: null,
        }).eq('target', fila.target);
        continue;
      }

      const nuevasFallas = (fila.consecutive_failures ?? 0) + 1;
      const yaEstabaCaido = fila.is_up === false;

      if (!yaEstabaCaido && nuevasFallas >= FAILURE_THRESHOLD) {
        eventos.push({ target: fila.target, tipo: 'down', detalle: check.error || 'no responde' });
        await admin.from('site_uptime_status').update({
          is_up: false,
          consecutive_failures: nuevasFallas,
          last_checked_at: ahora.toISOString(),
          last_status_change_at: ahora.toISOString(),
          last_alert_at: ahora.toISOString(),
          last_error: check.error,
        }).eq('target', fila.target);
      } else if (yaEstabaCaido) {
        const ultimaAlerta = fila.last_alert_at ? new Date(fila.last_alert_at).getTime() : 0;
        const tocaRecordatorio = ahora.getTime() - ultimaAlerta > REMINDER_MS;
        if (tocaRecordatorio) {
          const minutosCaido = fila.last_status_change_at ? Math.round((ahora.getTime() - new Date(fila.last_status_change_at).getTime()) / 60000) : null;
          eventos.push({ target: fila.target, tipo: 'reminder', detalle: `Sigue caído${minutosCaido !== null ? ` hace ${minutosCaido} min` : ''}: ${check.error || 'no responde'}` });
        }
        await admin.from('site_uptime_status').update({
          consecutive_failures: nuevasFallas,
          last_checked_at: ahora.toISOString(),
          last_alert_at: tocaRecordatorio ? ahora.toISOString() : fila.last_alert_at,
          last_error: check.error,
        }).eq('target', fila.target);
      } else {
        // Primera falla sola, todavia no llega al umbral -- no alerta, solo cuenta.
        await admin.from('site_uptime_status').update({
          consecutive_failures: nuevasFallas,
          last_checked_at: ahora.toISOString(),
          last_error: check.error,
        }).eq('target', fila.target);
      }
    }

    if (eventos.length && resendKey && alertTo) {
      const asunto = eventos.some((e) => e.tipo === 'down')
        ? '🔴 LokomproAqui caído'
        : eventos.some((e) => e.tipo === 'reminder')
        ? '🔴 LokomproAqui sigue caído'
        : '🟢 LokomproAqui se recuperó';
      const nombreTarget: Record<string, string> = {
        dominio: 'lokomproaqui.com (dominio real)',
        app: 'lokomproaqui-next.vercel.app (app en Vercel, sin pasar por el dominio)',
      };
      const filasHtml = resumen.map((r) => `<li><strong>${nombreTarget[r.target] || r.target}:</strong> ${r.ok ? '🟢' : '🔴'} ${r.detalle}</li>`).join('');
      const eventosHtml = eventos.map((e) => `<li>${nombreTarget[e.target] || e.target}: ${e.detalle}</li>`).join('');
      const dominioCaidoAppViva = eventos.some((e) => e.target === 'dominio' && e.tipo !== 'recovered') && resumen.find((r) => r.target === 'app')?.ok;
      const html = `
<!doctype html><html><body style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
  <h1 style="font-size:20px;margin:0 0 16px">${asunto}</h1>
  <ul>${eventosHtml}</ul>
  ${dominioCaidoAppViva ? '<p style="background:#fef3c7;padding:12px;border-radius:8px;color:#92400e"><strong>Diagnóstico:</strong> el dominio no responde pero la app en Vercel sí está viva -- es un problema de enrutamiento/DNS del dominio, no de la aplicación. Mismo patrón del incidente del 2026-07-22.</p>' : ''}
  <h2 style="font-size:15px;margin-top:24px">Estado actual de ambos objetivos</h2>
  <ul>${filasHtml}</ul>
  <p style="color:#999;font-size:11px;margin-top:24px">Chequeo automático cada 5 min · ${new Date().toISOString()}</p>
</body></html>`;
      await enviarAlerta(resendKey, resendFrom, alertTo, asunto, html);
    }

    return json({ resumen, eventos });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
