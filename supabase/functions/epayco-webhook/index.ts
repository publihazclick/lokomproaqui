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
