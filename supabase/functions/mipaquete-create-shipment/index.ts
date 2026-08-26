// Genera la guia real de envio en Mipaquete para un pedido ya cotizado.
// Entrada: { order_id, delivery_company_id, delivery_company_name, request_pickup? }
//
// CAMBIO 2026-07-29 (pedido explicito del usuario): se migro de la API publica de pago
// (api.mipaquete.com + MIPAQUETE_API_KEY) a la API interna login-based (core.mipaquete.com) --
// mismo cambio y mismos detalles que mipaquete-quote/index.ts, ver ese archivo y la memoria
// mipaquete_internal_api_lokomproaqui para el contexto completo (bug del countryCode "170" vs
// "CO", customer-keys extraidos del bundle real de app.mipaquete.com).
//
// BUG REAL RESUELTO 2026-08-10 -- esta era la causa raiz real del 500 "Cannot read properties of
// undefined (reading 'details')" que se arrastraba desde 2026-07-29, no ninguno de los campos del
// payload (esos SI tenian bugs reales tambien, ya corregidos aparte, pero no eran la causa
// bloqueante). Confirmado con pruebas en vivo bisectando el payload completo campo por campo hasta
// dejar SOLO el customer-key como variable: `/sendings/createSendings` exige el MISMO customer-key
// que `/users/loginUser` (LOGIN_CUSTOMER_KEY, "b0c6d2aa-...") -- NO el de cotizar/getLocations
// (QUOTE_CUSTOMER_KEY, "74390816-..."). Reproducido el crash exacto tomando un payload 100%
// funcional y cambiando UNICAMENTE el customer-key al de cotizar. Una nota de una sesion anterior
// decia "el customer-key de cotizar SI sirve tambien para createSendings" -- esa conclusion era
// incorrecta, se baso en una prueba que fallaba de todas formas por otros bugs del payload (ya
// corregidos) sin llegar a aislar el customer-key como variable.
//
// Payload reconstruido leyendo la invocacion REAL de createSendings en el bundle JS de
// app.mipaquete.com (no adivinado): reveló varios campos que la integracion vieja de
// api.mipaquete.com no necesitaba pero esta si exige/usa -- `user` (el _id de la cuenta
// logueada, ver dataUserlogin en el docx de referencia -- SI es un requisito real, no una
// decision de negocio de un tercero como se penso al principio), `price`/`deliveryTime`/
// `pickupTime`/`productInformation.realWeight` (salen de la cotizacion ya elegida, por eso aca
// se vuelve a cotizar justo antes de crear la guia para tener esos datos frescos), y el
// `prefix` va SIN el "+" ("57", no "+57", tabla real: it={170:"57",...}). Campo
// `collectionService` visto en la llamada real pero de significado no confirmado (variable de
// estado de UI no rastreable desde el bundle) -- se omite a proposito, no se pudo confirmar si
// Mipaquete lo exige de verdad.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOGIN_CUSTOMER_KEY = 'b0c6d2aa-4d53-11eb-ae93-0242ac130002';
const QUOTE_CUSTOMER_KEY = '74390816-b8bd-4c38-8c5d-4453256c110e';
// Confirmado en vivo 2026-08-10 (ver comentario arriba): createSendings usa el MISMO customer-key
// que loginUser, no el de cotizar. Se deja configurable por env var igual que antes por si Mipaquete
// llega a cambiar esto, pero el fallback correcto ahora es LOGIN_CUSTOMER_KEY.
const SENDING_CUSTOMER_KEY = Deno.env.get('MIPAQUETE_SENDING_CUSTOMER_KEY') || LOGIN_CUSTOMER_KEY;
const MIPAQUETE_COUNTRY_CODE = '170';
// Tabla real de prefijos telefonicos de Mipaquete (bundle: it={170:"57",...}) -- SIN el "+".
const MIPAQUETE_PHONE_PREFIX = '57';

let cachedToken: string | null = null;
let cachedUserId: string | null = null;
let cachedDocumentNumber: string | null = null;
let cachedDocumentType: string | null = null;
let cachedTokenAt = 0;
const TOKEN_CACHE_TTL_MS = 1000 * 60 * 20;

// BUG REAL RESUELTO 2026-08-10 (pedido explicito del usuario, confirmado con pruebas reales en
// vivo): `sender.nit`/`nitType` SIEMPRE deben ser la cedula de la cuenta de Mipaquete logueada
// (el convenio/tarifa esta negociado con ESA cuenta, no con cada bodega individual), sin importar
// que bodega despache el pedido -- exactamente igual que `sender.name`/`cellPhone`/`email`, que ya
// eran fijos por plataforma desde antes (Fase 3, anonimato proveedor<->vendedor). Antes se mandaba
// `pickup.id_document` (lo que cada proveedor haya escrito en su perfil, sin validacion real) --
// una bodega con una cedula mal escrita (9 digitos, formato invalido) rompia createSendings con un
// 500 dificil de diagnosticar del lado de Mipaquete. Se saca del mismo login (`user.documentNumber`/
// `documentType`), no de una nueva env var, para que sea SIEMPRE la cuenta real que esta autenticada
// -- si el email/password de la cuenta cambia algun dia, esto se actualiza solo. Solo
// `pickupAddress` sigue siendo dinamico por proveedor (el mensajero SI necesita la ubicacion fisica
// real para recoger).
async function getMipaqueteSession(): Promise<{ token: string; userId: string; documentNumber: string; documentType: string }> {
  const now = Date.now();
  if (cachedToken && cachedUserId && cachedDocumentNumber && cachedDocumentType && now - cachedTokenAt < TOKEN_CACHE_TTL_MS) {
    return { token: cachedToken, userId: cachedUserId, documentNumber: cachedDocumentNumber, documentType: cachedDocumentType };
  }

  const email = Deno.env.get('MIPAQUETE_WEB_EMAIL');
  const password = Deno.env.get('MIPAQUETE_WEB_PASSWORD');
  if (!email || !password) throw new Error('MIPAQUETE_WEB_EMAIL/MIPAQUETE_WEB_PASSWORD no configuradas');

  const resp = await fetch('https://core.mipaquete.com/users/loginUser', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'customer-key': LOGIN_CUSTOMER_KEY,
      'session-tracker': crypto.randomUUID(),
    },
    body: JSON.stringify({ email, password }),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error('Mipaquete rechazo el login: ' + text.slice(0, 300));

  let data: any;
  try { data = JSON.parse(text); } catch { data = null; }
  const token = data?.token;
  const userId = data?.user?._id;
  const documentNumber = data?.user?.documentNumber;
  const documentType = data?.user?.documentType;
  if (!token || !userId) throw new Error('Mipaquete no devolvio token/user._id en el login');
  if (!documentNumber || !documentType) throw new Error('Mipaquete no devolvio documentNumber/documentType de la cuenta en el login');

  cachedToken = token;
  cachedUserId = userId;
  cachedDocumentNumber = documentNumber;
  cachedDocumentType = documentType;
  cachedTokenAt = now;
  return { token, userId, documentNumber, documentType };
}

// AGREGADO 2026-08-10 (pedido explicito del usuario, "etiqueta para impresion"): createSendings NO
// devuelve la etiqueta oficial del transportador (codigo de barras) en su respuesta -- solo mpCode/
// message. Confirmado en vivo que Mipaquete SI la genera y la deja lista casi de inmediato, pero hay
// que pedirla aparte via getShipments (campo pdfGuide, un array de URLs S3 publicas: la primera es
// la etiqueta, la segunda un "relation" auxiliar). Se reintenta 3 veces con espera corta por si el
// PDF todavia no esta listo justo al momento de crear la guia -- si tras los reintentos sigue sin
// llegar, no se bloquea la respuesta (la guia YA es real y valida), simplemente queda sin etiqueta
// guardada por ahora.
async function fetchLabelUrl(token: string, mpCode: number): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
    try {
      const resp = await fetch('https://core.mipaquete.com/sendings/getShipments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'customer-key': LOGIN_CUSTOMER_KEY,
          'session-tracker': crypto.randomUUID(),
          token,
        },
        body: JSON.stringify({ filters: { mpCode } }),
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      const pdfGuide = data?.shipments?.[0]?.pdfGuide;
      if (Array.isArray(pdfGuide) && pdfGuide[0]) return String(pdfGuide[0]);
    } catch {
      // se ignora, se reintenta
    }
  }
  return null;
}

async function quoteShipping(token: string, params: {
  originDaneCode: string; destinyDaneCode: string;
  height: number; width: number; length: number; weight: number; declaredValue: number;
}): Promise<any[]> {
  const resp = await fetch('https://core.mipaquete.com/routes/quoteShipping', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'customer-key': QUOTE_CUSTOMER_KEY,
      'session-tracker': crypto.randomUUID(),
      token,
    },
    body: JSON.stringify({
      originCountryCode: MIPAQUETE_COUNTRY_CODE,
      originLocationCode: params.originDaneCode,
      destinyCountryCode: MIPAQUETE_COUNTRY_CODE,
      destinyLocationCode: params.destinyDaneCode,
      height: params.height,
      width: params.width,
      length: params.length,
      weight: params.weight,
      quantity: 1,
      declaredValue: params.declaredValue,
      saleValue: 0,
    }),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error('Mipaquete rechazo la re-cotizacion: ' + text.slice(0, 300));
  try { return JSON.parse(text); } catch { return []; }
}

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
      .select('*, order_items(quantity, products(width, height, length, weight, client_sale_price, name))')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) return json({ error: 'Pedido no encontrado' }, 404);
    if (order.mipaquete_shipment_id) return json({ error: 'Este pedido ya tiene guia generada', sending_id: order.mipaquete_shipment_id }, 409);
    if (!order.destino_dane_code) return json({ error: 'Pedido sin destino DANE, cotiza primero' }, 400);

    // Fase 3 del plan de aislamiento proveedor<->vendedor (pedido explicito del usuario 2026-07-20):
    // la direccion de recogida es la del PROVEEDOR, no la del vendedor -- es quien tiene el producto
    // fisico y quien de verdad va a despachar. Antes se buscaba por order.seller_id, lo que en la
    // practica exigia que vendedor y proveedor ya se hubieran coordinado por fuera de la plataforma
    // para que el paquete llegara a manos del vendedor -- exactamente lo que este plan busca evitar.
    let pickup: any = null;
    if (order.supplier_id) {
      const { data } = await admin.from('pickup_addresses').select('*').eq('profile_id', order.supplier_id).order('id', { ascending: false }).limit(1).maybeSingle();
      pickup = data;
    }
    // Bug real encontrado 2026-07-29: sin direccion de recogida, sender.nit/pickupAddress quedaban
    // vacios y Mipaquete rechazaba con un error cripico en ingles ("sender,nit is required or its
    // format is not valid") sin decir cual era el problema real. Se corta antes con un mensaje claro
    // -- este pedido no es el unico afectado, bloquea TODOS los pedidos de un proveedor que nunca
    // completo su direccion de recogida.
    if (order.supplier_id && !pickup) {
      return json({ error: 'El proveedor de este pedido no tiene registrada su dirección de recogida. Pídele que la complete en su perfil antes de generar la guía.' }, 400);
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

    // Remitente NEUTRO (Fase 3 del plan de aislamiento proveedor<->vendedor, pedido explicito del
    // usuario 2026-07-20): antes era "LOKOMPROAQUI/" + el nombre real del vendedor, con su telefono
    // real como contacto -- el comprador final que recibe el paquete podia ver esos datos en la
    // etiqueta fisica e identificar/contactar directo al vendedor (y, si se buscaba la direccion de
    // recogida, tambien al proveedor), saltandose la plataforma por completo. Ahora el remitente es
    // siempre "LOKOMPROAQUI", sin nombre de nadie, con telefono/correo de soporte genericos (no el
    // WhatsApp real del proveedor) -- la direccion de recogida SI sigue siendo la real (el mensajero
    // necesita saber donde recoger fisicamente), pero eso no queda expuesto en ningun dato visible
    // para el comprador mas alla de la ciudad de origen.
    const originDaneCode = String(pickup?.city_dane_code || Deno.env.get('MIPAQUETE_ORIGIN_DANE') || '11001000');
    const destinyDaneCode = String(order.destino_dane_code);

    const { token, userId, documentNumber, documentType } = await getMipaqueteSession();

    // Se vuelve a cotizar justo antes de crear la guia: createSendings real exige price/
    // deliveryTime/pickupTime/productInformation.realWeight (ver comentario arriba), datos que
    // solo salen de una cotizacion fresca -- mipaquete-quote solo persiste destino_dane_code en
    // el pedido, no guarda la cotizacion completa elegida.
    const quotes = await quoteShipping(token, {
      originDaneCode, destinyDaneCode,
      height: maxHeight, width: maxWidth, length: maxLength, weight: weightKg, declaredValue,
    });
    const selectedQuote = quotes.find((q: any) => String(q.deliveryCompanyId) === String(deliveryCompanyId));
    if (!selectedQuote) {
      return json({ error: 'La transportadora elegida ya no esta disponible para esta ruta, vuelve a cotizar.' }, 409);
    }

    const sendingPayload = {
      sender: {
        name: 'LOKOMPROAQUI',
        // '.' como respaldo no vacio: mismo patron ya usado mas abajo para el apellido del
        // comprador (`buyerRest.join(' ') || '.'`) cuando no hay un segundo campo real que mandar.
        surname: '.',
        cellPhone: String(Deno.env.get('MIPAQUETE_DEFAULT_PHONE') || ''),
        prefix: MIPAQUETE_PHONE_PREFIX,
        email: String(Deno.env.get('MIPAQUETE_DEFAULT_EMAIL') || 'pedidos@lokomproaqui.com'),
        pickupAddress: String(pickup?.address || Deno.env.get('MIPAQUETE_DEFAULT_ADDRESS') || ''),
        // Pedido explicito del usuario 2026-08-10: la cedula del remitente SIEMPRE es la de la
        // cuenta de Mipaquete (el convenio/tarifa es con esa cuenta), nunca la del proveedor/bodega
        // -- ver comentario en getMipaqueteSession(). pickupAddress arriba SI sigue siendo dinamico.
        nit: documentNumber,
        nitType: documentType,
      },
      receiver: {
        name: buyerFirst || 'Cliente',
        surname: buyerRest.join(' ') || '.',
        // BUG REAL RESUELTO 2026-08-10: `orders` no tiene columna de email del comprador (columna
        // inexistente, `(order as any).buyer_email` siempre fue `undefined`), asi que el respaldo
        // caia SIEMPRE al mismo valor fijo -- y como el `sender.email` de arriba TAMBIEN cae a un
        // valor fijo cuando no hay env var, en la practica sender.email === receiver.email en TODO
        // pedido creado por esta funcion. Confirmado con pruebas reales en vivo que esto es lo que
        // rompia createSendings (500 "Cannot read properties of undefined (reading 'details')")
        // incluso con el resto del payload ya corregido -- Mipaquete no acepta enviarse un paquete
        // a si mismo. El respaldo ahora incluye el id del pedido para que sea unico Y distinto del
        // de sender en todos los casos, no solo "distinto por casualidad".
        email: String((order as any).buyer_email || `pedido${orderId}@lokomproaqui.com`),
        prefix: MIPAQUETE_PHONE_PREFIX,
        cellPhone: String(order.buyer_phone || ''),
        destinationAddress: String(order.buyer_address || ''),
        // CORREGIDO 2026-08-10: se habia intentado antes con nitType "N/A" (en vez de "CC" con
        // un telefono, que si crasheaba a Mipaquete) pensando que el campo era obligatorio -- pero
        // comparado campo por campo contra guias reales YA CREADAS con exito con esta misma cuenta
        // (via getShipments, no una suposicion), el receiver de la app real NUNCA manda nit/nitType
        // en absoluto. Se quita el campo por completo en vez de intentar adivinar un valor valido.
      },
      productInformation: {
        quantity: 1,
        width: maxWidth,
        large: maxLength,
        height: maxHeight,
        weight: weightKg,
        // El "peso real" ya calculado por la transportadora al cotizar (puede diferir del fisico
        // por volumetria) -- campo del payload real que la integracion vieja no mandaba.
        realWeight: Number(selectedQuote.realWeightVolume) || weightKg,
        // CORREGIDO 2026-08-10: estaba en `false` por suponer que significaba "es un producto
        // prohibido" -- confirmado contra multiples guias reales ya creadas con exito (via
        // getShipments) que la app real SIEMPRE manda `true` aca, sin excepcion, sin importar el
        // producto. El nombre del campo es enganoso; el valor real esperado es `true`.
        forbiddenProduct: true,
        productReference: String(items[0]?.products?.name || 'Producto'),
        declaredValue,
      },
      locate: {
        originDaneCode,
        destinyDaneCode,
        originCountryCode: MIPAQUETE_COUNTRY_CODE,
        destinyCountryCode: MIPAQUETE_COUNTRY_CODE,
      },
      channel: 'LokomproAqui',
      // `user`: el _id de la cuenta Mipaquete logueada -- campo raiz obligatorio confirmado
      // leyendo la llamada real de createSendings en el bundle de app.mipaquete.com (`user:t._id`).
      user: userId,
      price: Number(selectedQuote.shippingCost) || 0,
      deliveryTime: selectedQuote.shippingTime ?? null,
      pickupTime: selectedQuote.pickupTime ?? null,
      deliveryCompanyName: body.delivery_company_name || selectedQuote.deliveryCompanyName || deliveryCompanyId,
      deliveryCompany: String(deliveryCompanyId),
      description: String(items[0]?.products?.name || 'Producto'),
      comments: 'Pedido LokomproAqui #' + orderId,
      paymentType,
      valueCollection,
      // AGREGADO 2026-08-10: los 3 campos de aca abajo (collectionService, isExpressService,
      // activeNotifications) faltaban por completo en el payload -- se habian omitido a proposito
      // en 2026-07-29 por no poder confirmar su formato/significado real, y son la causa mas
      // probable del 500 "Cannot read properties of undefined (reading 'details')" que veniamos
      // arrastrando (algun codigo de Mipaquete intentando leer una propiedad anidada de un campo
      // que nunca llegaba). Confirmados los 3 comparando campo por campo contra multiples guias
      // reales YA CREADAS con exito con esta misma cuenta (via getShipments) -- no son una
      // suposicion nueva, son literalmente lo que la app real siempre manda.
      collectionService: paymentType === 102,
      requestPickup: !!body.request_pickup,
      shippingTime: selectedQuote.shippingTime ?? null,
      adminTransactionData: {
        saleValue,
      },
      isExpressService: false,
      activeNotifications: [220],
    };

    const resp = await fetch('https://core.mipaquete.com/sendings/createSendings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'customer-key': SENDING_CUSTOMER_KEY,
        'session-tracker': crypto.randomUUID(),
        token,
      },
      body: JSON.stringify(sendingPayload),
    });

    const text = await resp.text();
    if (!resp.ok) return json({ error: 'Error al crear guia en Mipaquete', status: resp.status, detail: text.slice(0, 500), payload_sent: sendingPayload }, 502);

    let parsed: any;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }

    const sendingId = parsed?.mpCode ?? parsed?._id ?? parsed?.id ?? null;
    const guia = parsed?.guideNumber ?? parsed?.guide ?? parsed?.trackingNumber ?? sendingId;
    const labelUrl = sendingId ? await fetchLabelUrl(token, Number(sendingId)) : null;

    await admin.from('orders').update({
      mipaquete_shipment_id: sendingId,
      tracking_number: guia,
      carrier: body.delivery_company_name || deliveryCompanyId,
      carrier_logo_url: body.delivery_company_logo_url || null,
      mipaquete_label_url: labelUrl,
    }).eq('id', orderId);

    return json({ status: 'ok', sending_id: sendingId, guia, label_url: labelUrl, mipaquete_response: parsed });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
