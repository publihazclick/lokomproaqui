// Webhook de confirmacion de pago de ePayco. ePayco llama esto (form-encoded POST) cuando
// una transaccion de recarga cambia de estado. Verifica la firma y marca la compra como pagada.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const P_CUST_ID = Deno.env.get('EPAYCO_P_CUST_ID_CLIENTE')!;
const P_KEY = Deno.env.get('EPAYCO_P_KEY')!;

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  try {
    const contentType = req.headers.get('content-type') || '';
    let params: Record<string, string> = {};

    if (contentType.includes('application/json')) {
      params = await req.json();
    } else {
      const form = await req.formData();
      form.forEach((value, key) => { params[key] = String(value); });
    }

    const refPayco = params['x_ref_payco'];
    const transactionId = params['x_transaction_id'];
    const amount = params['x_amount'];
    const currency = params['x_currency_code'];
    const response = params['x_response'];
    const invoice = params['x_id_invoice'];
    const signature = params['x_signature'];

    const expectedSignature = await sha256Hex(`${P_CUST_ID}^${P_KEY}^${refPayco}^${transactionId}^${amount}^${currency}`);
    if (signature !== expectedSignature) {
      return new Response(JSON.stringify({ error: 'Firma invalida' }), { status: 400 });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const newStatus = response === 'Aceptada' ? 2 : (response === 'Rechazada' ? 1 : 0);

    // Recarga de billetera dropshipper (distinta de las recargas de celular de mas abajo):
    // el invoice se genera como "TOPUP-<codigo>" desde WalletService.createTopup.
    if (invoice && invoice.startsWith('TOPUP-')) {
      const { data: existing, error: fetchErr } = await supabase
        .from('wallet_topups')
        .select('profile_id, amount, status')
        .eq('code', invoice)
        .maybeSingle();

      if (fetchErr || !existing) {
        return new Response(JSON.stringify({ error: 'Recarga no encontrada' }), { status: 404 });
      }

      // ePayco puede reintentar el mismo webhook: solo acreditar si todavia no estaba pagada.
      const alreadyCredited = existing.status === 2;

      await supabase
        .from('wallet_topups')
        .update({ status: newStatus, epayco_transaction_id: transactionId })
        .eq('code', invoice);

      if (newStatus === 2 && !alreadyCredited) {
        const { error: creditErr } = await supabase.rpc('credit_wallet', {
          p_profile_id: existing.profile_id,
          p_wallet_type: 'dropshipper',
          p_amount: Number(existing.amount),
          p_order_id: null,
          p_pct: null,
          p_kind: 'recarga',
        });
        if (creditErr) {
          return new Response(JSON.stringify({ error: creditErr.message }), { status: 500 });
        }
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // Suscripcion mensual del curso "Acelerador de Ventas": el invoice se genera como
    // "SUB-<codigo>" desde AceleradorService.createPayment. A diferencia de TOPUP-, en vez de
    // acreditar una billetera, extiende (o inicia) acelerador_subscriptions.current_period_end.
    if (invoice && invoice.startsWith('SUB-')) {
      const { data: existing, error: fetchErr } = await supabase
        .from('acelerador_payments')
        .select('profile_id, status')
        .eq('code', invoice)
        .maybeSingle();

      if (fetchErr || !existing) {
        return new Response(JSON.stringify({ error: 'Pago no encontrado' }), { status: 404 });
      }

      // ePayco puede reintentar el mismo webhook: solo extender si todavia no estaba pagado.
      const alreadyPaid = existing.status === 2;

      await supabase
        .from('acelerador_payments')
        .update({ status: newStatus, epayco_transaction_id: transactionId })
        .eq('code', invoice);

      if (newStatus === 2 && !alreadyPaid) {
        const { error: extendErr } = await supabase.rpc('acelerador_extend_subscription', {
          p_profile_id: existing.profile_id,
          p_days: 30,
        });
        if (extendErr) {
          return new Response(JSON.stringify({ error: extendErr.message }), { status: 500 });
        }
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    const { error } = await supabase
      .from('recharge_purchases')
      .update({ status: newStatus, epayco_transaction_id: transactionId })
      .eq('code', invoice);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
