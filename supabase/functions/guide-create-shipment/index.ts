// Genera la guia real en Mipaquete para una guia SUELTA ya cotizada (modulo "Generacion de Guias",
// standalone_shipments -- ver mipaquete-create-shipment/index.ts para el equivalente atado a
// pedidos, que no se toca). Entrada: { shipment_id }
//
// A diferencia del flujo de pedidos, aca el cobro de la wallet (flete + seguro si aplica) se hace
// SIEMPRE antes de generar la guia -- no hay "cliente ya pago"/"envio incluido" que lo condicione,
// el flete de una guia suelta sale de la wallet sin excepcion (mismo principio que
// 041_flete_siempre_prepagado.sql ya aplica a 'contraentrega').
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const shipmentId = body.shipment_id;
    if (!shipmentId) return json({ error: 'shipment_id es requerido' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: guia, error: guiaErr } = await admin
      .from('standalone_shipments')
      .select('*, profiles:profile_id(full_name, last_name, phone)')
      .eq('id', shipmentId)
      .single();

    if (guiaErr || !guia) return json({ error: 'Guia no encontrada' }, 404);
    if (guia.mipaquete_shipment_id) return json({ error: 'Esta guia ya fue generada', sending_id: guia.mipaquete_shipment_id }, 409);
    if (!guia.destino_dane_code || !guia.delivery_company_id) return json({ error: 'Falta cotizar y elegir transportadora antes de generar la guia' }, 400);

    const freightCost = Number(guia.freight_cost) || 0;
    const insuranceCost = guia.insurance_active ? Number(guia.insurance_cost) || 0 : 0;
    const totalACobrar = freightCost + insuranceCost;
    const kind = guia.insurance_active ? 'flete_seguro_guia' : 'flete_guia';

    // Cobro idempotente: si "Generar guia" se reintenta tras un error transitorio de Mipaquete, no
    // vuelve a debitar (charge_standalone_shipment_wallet_if_needed, migracion 059).
    const { data: cobrado, error: cobroErr } = await admin.rpc('charge_standalone_shipment_wallet_if_needed', {
      p_shipment_id: shipmentId,
      p_profile_id: guia.profile_id,
      p_amount: totalACobrar,
      p_kind: kind,
    });
    if (cobroErr) {
      const msg = cobroErr.message && cobroErr.message.includes('saldo_insuficiente')
        ? 'Saldo insuficiente en tu billetera, recarga para continuar'
        : 'No pudimos procesar el pago con tu billetera';
      return json({ error: msg }, 200);
    }
    void cobrado; // true = se cobro ahora, false = ya estaba cobrado de un intento anterior -- en ambos casos se sigue a generar la guia.

    // Direccion de recogida: la del vendedor si la tiene guardada (paso "Datos de remitente" del
    // wizard), si no un fallback generico -- mismo patron que mipaquete-create-shipment.
    const { data: pickup } = await admin
      .from('pickup_addresses')
      .select('*')
      .eq('profile_id', guia.profile_id)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    const isPagoAnticipado = guia.payment_type === 'pago_anticipado';
    const collectionValue = isPagoAnticipado ? 0 : Number(guia.collection_value) || 0;
    const paymentType = collectionValue > 0 ? 102 : 101;
    const saleValue = collectionValue > 0 ? collectionValue : 0;

    const [receiverFirst, ...receiverRest] = (guia.receiver_name || 'Cliente').trim().split(/\s+/);
    const senderProfile: any = (guia as any).profiles || {};
    const storeName = `${senderProfile.full_name || ''} ${senderProfile.last_name || ''}`.trim() || 'Vendedor';

    const sendingPayload = {
      sender: {
        name: `LOKOMPROAQUI/${storeName}`,
        surname: '.',
        cellPhone: String(pickup?.whatsapp || senderProfile.phone || Deno.env.get('MIPAQUETE_DEFAULT_PHONE') || ''),
        prefix: '+57',
        email: String(pickup?.email || ''),
        pickupAddress: String(pickup?.address || Deno.env.get('MIPAQUETE_DEFAULT_ADDRESS') || ''),
        nit: String(pickup?.id_document || ''),
        nitType: 'CC',
      },
      receiver: {
        name: receiverFirst || 'Cliente',
        surname: receiverRest.join(' ') || '.',
        email: 'pedidos@lokomproaqui.com',
        prefix: '+57',
        cellPhone: String(guia.receiver_phone || ''),
        destinationAddress: String(guia.receiver_address || ''),
        nit: String(guia.receiver_phone || '0000000000'),
        nitType: 'CC',
      },
      productInformation: {
        quantity: 1,
        width: Number(guia.width) || 20,
        large: Number(guia.length) || 20,
        height: Number(guia.height) || 20,
        weight: Math.max(1, Number(guia.weight) || 1),
        forbiddenProduct: false,
        productReference: String(guia.content_description || 'Paquete'),
        declaredValue: Math.max(1, Math.round(Number(guia.declared_value) || 1)),
      },
      locate: {
        // Ciudad real de recogida (migracion 060) -- antes generaba SIEMPRE "desde Bogota" sin
        // importar la direccion real guardada arriba, lo que podia desalinear precio cobrado vs.
        // recogida real. Mismo fallback de siempre si el remitente aun no tiene ciudad guardada.
        originDaneCode: String(pickup?.city_dane_code || Deno.env.get('MIPAQUETE_ORIGIN_DANE') || '11001000'),
        destinyDaneCode: String(guia.destino_dane_code),
      },
      channel: 'LokomproAqui',
      deliveryCompany: String(guia.delivery_company_id),
      criteria: 'price',
      description: String(guia.content_description || 'Paquete'),
      comments: 'Guia LokomproAqui #' + shipmentId,
      paymentType,
      valueCollection: collectionValue,
      requestPickup: !!body.request_pickup,
      adminTransactionData: {
        saleValue,
      },
    };

    const apiKey = Deno.env.get('MIPAQUETE_API_KEY') ?? '';
    if (!apiKey) return json({ error: 'MIPAQUETE_API_KEY no configurada' }, 500);

    const resp = await fetch('https://api.mipaquete.com/createSending', {
      method: 'POST',
      headers: { apikey: apiKey, 'session-tracker': crypto.randomUUID(), 'Content-Type': 'application/json' },
      body: JSON.stringify(sendingPayload),
    });

    const text = await resp.text();
    if (!resp.ok) return json({ error: 'Ya cobramos el flete pero Mipaquete no pudo crear la guia: ' + text.slice(0, 300), status: resp.status }, 200);

    let parsed: any;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }

    const sendingId = parsed?.mpCode ?? parsed?._id ?? parsed?.id ?? null;
    const numeroGuia = parsed?.guideNumber ?? parsed?.guide ?? parsed?.trackingNumber ?? sendingId;

    await admin.from('standalone_shipments').update({
      mipaquete_shipment_id: sendingId,
      tracking_number: numeroGuia,
      delivery_company_name: body.delivery_company_name || guia.delivery_company_name,
      status: 'generated',
    }).eq('id', shipmentId);

    return json({ status: 'ok', sending_id: sendingId, guia: numeroGuia, mipaquete_response: parsed });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
