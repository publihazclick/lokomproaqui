// Genera la guia real de envio en Mipaquete para un pedido ya cotizado.
// Entrada: { order_id, delivery_company_id, delivery_company_name, request_pickup? }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const orderId = body.order_id;
    const deliveryCompanyId = body.delivery_company_id;
    if (!orderId || !deliveryCompanyId) return json({ error: 'order_id y delivery_company_id son requeridos' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: order, error: orderErr } = await admin
      .from('orders')
      .select('*, order_items(quantity, products(width, height, length, weight, client_sale_price, name)), profiles:seller_id(full_name, last_name, phone)')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) return json({ error: 'Pedido no encontrado' }, 404);
    if (order.mipaquete_shipment_id) return json({ error: 'Este pedido ya tiene guia generada', sending_id: order.mipaquete_shipment_id }, 409);
    if (!order.destino_dane_code) return json({ error: 'Pedido sin destino DANE, cotiza primero' }, 400);

    // Direccion de recogida: la del vendedor si la tiene guardada, si no un fallback generico.
    let pickup: any = null;
    if (order.seller_id) {
      const { data } = await admin.from('pickup_addresses').select('*').eq('profile_id', order.seller_id).order('id', { ascending: false }).limit(1).maybeSingle();
      pickup = data;
    }

    const items = (order as any).order_items || [];
    let totalWeight = 0, maxWidth = 20, maxHeight = 20, maxLength = 20, declaredValue = 0;
    for (const item of items) {
      const p = item.products || {};
      totalWeight += (Number(p.weight) || 1) * item.quantity;
      maxWidth = Math.max(maxWidth, Number(p.width) || 0);
      maxHeight = Math.max(maxHeight, Number(p.height) || 0);
      maxLength = Math.max(maxLength, Number(p.length) || 0);
      declaredValue += (Number(p.client_sale_price) || 0) * item.quantity;
    }
    const weightKg = Math.max(1, Math.ceil(totalWeight || 1));
    declaredValue = Math.max(1, Math.round(declaredValue || order.price_total || 1));

    const [buyerFirst, ...buyerRest] = (order.buyer_name || 'Cliente').trim().split(/\s+/);
    const sellerProfile: any = (order as any).profiles || {};

    // BUG RESUELTO (2026-07-10): la coleccion Postman OFICIAL de Mipaquete
    // (https://api.documentacion.mipaquete.com/, request "createSending" con ejemplo real
    // verificado, respuesta 200 "Envio generado correctamente") revela dos errores reales:
    // 1. paymentType debe mandarse como NUMERO, no como string (el codigo viejo hacia
    //    String(paymentType), Mipaquete lo rechazaba con "format is not valid").
    // 2. Los valores validos son 101 ("pago con saldo de mipaquete") y 102 ("descontando el
    //    envio del recaudo realizado, aplica para pago contra entrega") — el codigo viejo usaba
    //    1/101, y 1 nunca fue un valor valido documentado.
    // Ademas faltaba un campo raiz obligatorio segun el ejemplo oficial: adminTransactionData.saleValue
    // ("valor de venta del producto a enviar, aplica para pago contra entrega, si no se coloca 0").
    //
    // CAMBIO 2026-07-19 (pedido explicito del usuario): ya NO existe "contra entrega sin prepago".
    // TODO pedido -- 'contraentrega' incluido, con o sin seguro -- exige que el vendedor tenga
    // saldo suficiente en su wallet 'dropshipper' para cubrir el flete ANTES de poder generar la
    // guia (ver FormVentaDetalleModal, autorizarDespacho -- bloquea con "saldo insuficiente" si no
    // alcanza). El mensajero entonces NUNCA recauda el flete, solo el producto (salvo que tambien
    // este prepagado, ver isPrepaidByCustomer abajo) -- por eso 'contraentrega' ahora se trata
    // exactamente igual que 'dropshipping'/'muestra' para este calculo, ya no hay diferencia real
    // entre los 3 tipos de pedido en cuanto a quien financia el flete.
    const isSelfFundedFreight = order.order_type === 'dropshipping' || order.order_type === 'muestra' || order.order_type === 'contraentrega';
    // "Mi cliente ya me pago el producto" (pedido explicito del usuario 2026-07-18, ampliado
    // 2026-07-19 a cualquier tipo de pedido -- antes solo aplicaba a dropshipping. Ahora el
    // vendedor tambien lo puede marcar manualmente al autorizar una venta normal 'contraentrega'
    // desde FormVentaDetalleModal, si el cliente ya le pago por fuera de la plataforma). El
    // producto ya esta saldado, asi que el mensajero NUNCA debe recaudarlo -- se reusa
    // shipping_included con un significado nuevo en este caso especifico: true = tambien le
    // pagaron el flete (recaudo $0), false = el flete lo paga aparte al mensajero (recaudo = solo
    // el flete). Ver customer_prepaid_product en la migracion 039.
    const isPrepaidByCustomer = order.customer_prepaid_product === true;
    const selfFundedCollection = isPrepaidByCustomer
      ? (order.shipping_included === false ? (Number(order.freight_value) || 0) : 0)
      : (Number(order.price_total) || declaredValue)
        + (order.order_type === 'dropshipping' && order.shipping_included === false ? (Number(order.freight_value) || 0) : 0);
    const valueCollection = isSelfFundedFreight || isPrepaidByCustomer ? selfFundedCollection : 0;
    // CAMBIO 2026-07-18 (pedido explicito del usuario): paymentType ya NO depende del tipo de
    // pedido, depende de si hay recaudo real. Antes 'dropshipping'/'muestra' usaban 101 ("pago con
    // saldo de mipaquete" -- cobrado de nuestro saldo propio en Mipaquete, exigia tenerlo cargado).
    // Como el mensajero YA recauda el valor del producto en esos casos (ver arriba), Mipaquete
    // puede descontar su tarifa de ESE recaudo (paymentType 102) -- el vendedor ya cubrio el flete
    // via wallet, asi que las cuentas cuadran sin que nuestra cuenta de Mipaquete necesite saldo
    // propio. Solo pedidos SIN ningun recaudo (ya pagados 100% online: Shopify/WooCommerce,
    // valueCollection=0) siguen necesitando 101, porque ahi no hay plata en la calle de la que
    // Mipaquete pueda descontar su tarifa.
    const paymentType = valueCollection > 0 ? 102 : 101;
    // saleValue: "aplica para servicio de pago contra entrega, si no se coloca 0" — en la
    // practica, cualquier caso donde SI hay recaudo (valueCollection > 0) necesita el valor de
    // venta real para la liquidacion de Mipaquete.
    const saleValue = valueCollection > 0 ? selfFundedCollection : 0;

    // Nombre del remitente (pedido explicito del usuario 2026-07-18, ajustado el mismo dia): fijo
    // "LOKOMPROAQUI/" + el nombre de la tienda (perfil) del vendedor que hizo la venta -- el mismo
    // full_name/last_name que identifica su tienda publica cuando comparte su link. Antes era un
    // nombre 100% fijo sin distincion de tienda; ahora la marca queda siempre visible PERO tambien
    // se puede saber de un vistazo que vendedor genero cada guia. La direccion de recogida (mas
    // abajo, pickupAddress) sigue siendo la real de cada proveedor/bodega -- eso no cambia, el
    // mensajero necesita el lugar correcto, solo el nombre del remitente se compone asi.
    const storeName = `${sellerProfile.full_name || ''} ${sellerProfile.last_name || ''}`.trim() || 'Vendedor';

    const sendingPayload = {
      sender: {
        name: `LOKOMPROAQUI/${storeName}`,
        // '.' como respaldo no vacio: mismo patron ya usado mas abajo para el apellido del
        // comprador (`buyerRest.join(' ') || '.'`) cuando no hay un segundo campo real que mandar.
        surname: '.',
        cellPhone: String(pickup?.whatsapp || sellerProfile.phone || Deno.env.get('MIPAQUETE_DEFAULT_PHONE') || ''),
        prefix: '+57',
        email: String(pickup?.email || ''),
        pickupAddress: String(pickup?.address || Deno.env.get('MIPAQUETE_DEFAULT_ADDRESS') || ''),
        nit: String(pickup?.id_document || ''),
        nitType: 'CC',
      },
      receiver: {
        name: buyerFirst || 'Cliente',
        surname: buyerRest.join(' ') || '.',
        // Mipaquete exige un email con formato valido; orders no tiene columna de email del
        // comprador, asi que se usa un valor de respaldo generico cuando no hay uno real.
        email: String((order as any).buyer_email || 'pedidos@lokomproaqui.com'),
        prefix: '+57',
        cellPhone: String(order.buyer_phone || ''),
        destinationAddress: String(order.buyer_address || ''),
        // orders no tiene columna de documento del comprador; se usa el telefono como respaldo
        // (igual que el email, Mipaquete solo exige formato valido, no que sea la cedula real).
        nit: String((order as any).buyer_document || order.buyer_phone || '0000000000'),
        nitType: 'CC',
      },
      productInformation: {
        quantity: 1,
        width: maxWidth,
        large: maxLength,
        height: maxHeight,
        weight: weightKg,
        forbiddenProduct: false,
        productReference: String(items[0]?.products?.name || 'Producto'),
        declaredValue,
      },
      locate: {
        originDaneCode: String(order.origen_dane_code || Deno.env.get('MIPAQUETE_ORIGIN_DANE') || '11001000'),
        destinyDaneCode: String(order.destino_dane_code),
      },
      channel: 'LokomproAqui',
      deliveryCompany: String(deliveryCompanyId),
      criteria: 'price',
      description: String(items[0]?.products?.name || 'Producto'),
      comments: 'Pedido LokomproAqui #' + orderId,
      paymentType,
      valueCollection,
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
    if (!resp.ok) return json({ error: 'Error al crear guia en Mipaquete', status: resp.status, detail: text.slice(0, 500) }, 502);

    let parsed: any;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }

    const sendingId = parsed?.mpCode ?? parsed?._id ?? parsed?.id ?? null;
    const guia = parsed?.guideNumber ?? parsed?.guide ?? parsed?.trackingNumber ?? sendingId;

    await admin.from('orders').update({
      mipaquete_shipment_id: sendingId,
      tracking_number: guia,
      carrier: body.delivery_company_name || deliveryCompanyId,
    }).eq('id', orderId);

    return json({ status: 'ok', sending_id: sendingId, guia, mipaquete_response: parsed });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
