import { Injectable } from '@angular/core';
import { ServiciosService } from '../services/servicios.service';
import { supabase } from '../services/supabase.client';
import { from } from 'rxjs';

const STATUS_TO_LEGACY: any = { pending: 0, success: 1, rejected: 2, dispatched: 3, invoiced: 4, deleted: 5, preparing: 6 };
const LEGACY_TO_STATUS: any = { 0: 'pending', 1: 'success', 2: 'rejected', 3: 'dispatched', 4: 'invoiced', 5: 'deleted', 6: 'preparing' };

function mapOrderToLegacy(order: any) {
  return {
    id: order.id,
    ven_estado: STATUS_TO_LEGACY[order.status] != null ? STATUS_TO_LEGACY[order.status] : 0,
    usu_clave_int: order.seller_id,
    ven_nombre_cliente: order.buyer_name,
    ven_telefono_cliente: order.buyer_phone,
    ven_direccion_cliente: order.buyer_address,
    ven_ciudad: order.buyer_city,
    ven_barrio: order.buyer_neighborhood,
    ven_cantidad: order.quantity_total,
    ven_total: order.price_total,
    ven_precio: order.price_total,
    ven_ganancias: order.earnings_total,
    ven_sw_eliminado: order.status === 'deleted' ? 1 : 0,
    ven_numero_guia: order.tracking_number,
    ven_tipo: order.order_type,
    slug: String(order.id),
    createdAt: order.created_at,
    ven_retiro: order.withdrawn,
  };
}

@Injectable({
  providedIn: 'root'
})
export class VentasService {

  constructor(
    private _model: ServiciosService
  ) { }

  // Panel admin: listado de pedidos con filtros basicos (vendedor, estado, busqueda por telefono/guia).
  get(query: any) {
    const where = (query && query.where) || {};
    const page = query.page || 0;
    const limit = query.limit || 10;

    const run = async (): Promise<any> => {
      let q = supabase.from('orders').select('*', { count: 'exact' });

      if (where.usu_clave_int) q = q.eq('seller_id', where.usu_clave_int);
      if (where.ven_estado !== undefined && typeof where.ven_estado === 'number') {
        q = q.eq('status', LEGACY_TO_STATUS[where.ven_estado] || 'pending');
      }
      if (where.id) q = q.eq('id', where.id);

      const term = where.ven_telefono_cliente || where.ven_numero_guia || (where.slug && where.slug.contains) || null;
      if (term) q = q.or(`buyer_phone.ilike.%${term}%,tracking_number.ilike.%${term}%`);

      q = q.order('created_at', { ascending: false });
      q = q.range(page * limit, page * limit + limit - 1);

      const { data, error, count } = await q;
      if (error || !data) return { success: false, data: [], count: 0 };
      return { success: true, data: data.map(mapOrderToLegacy), count: count != null ? count : data.length };
    };

    return from(run());
  }

  // Checkout nuevo: un pedido con todas las lineas del carrito, decremento atomico de stock via RPC.
  // cartItems: [{ articulo(product id), talla, color, cantidad, costo, costoTotal, titulo, foto }]
  createOrder(orderInfo: any, cartItems: any[]) {
    const run = async (): Promise<any> => {
      const items: any[] = [];

      for (const item of cartItems) {
        let variantId: any = null;
        if (item.talla) {
          const { data: variant } = await supabase
            .from('product_variants')
            .select('id, sizes!inner(name)')
            .eq('product_id', item.articulo)
            .eq('sizes.name', item.talla)
            .maybeSingle();
          if (variant) variantId = variant.id;
        }

        items.push({
          product_id: item.articulo,
          product_variant_id: variantId,
          title: item.titulo,
          unit_price: item.costo,
          quantity: item.cantidad,
          size: item.talla || null,
          color: item.color || null,
          seller_cost: null,
          total_cost: item.costoTotal,
        });
      }

      const { data: orderId, error } = await supabase.rpc('create_order', {
        order_data: {
          seller_id: orderInfo.seller_id || null,
          buyer_name: orderInfo.buyer_name,
          buyer_phone: orderInfo.buyer_phone,
          buyer_address: orderInfo.buyer_address,
          buyer_city: orderInfo.buyer_city,
          buyer_neighborhood: orderInfo.buyer_neighborhood,
          order_type: 'contraentrega',
          freight_payer: 'cliente',
        },
        items,
      });

      if (error) {
        const msg = error.message && error.message.includes('stock_insuficiente')
          ? 'Uno de los productos ya no tiene stock disponible en esa talla'
          : 'No pudimos procesar tu pedido, intenta de nuevo';
        return { success: false, message: msg };
      }

      return { success: true, data: { id: orderId } };
    };

    return from(run());
  }
  create(query:any){
    return this._model.querys('tblventas',query, 'post');
  }
  create2(query:any){
    return this._model.querys('ventasDBI',query, 'post');
  }

  // Cambia el estado del pedido (usado por el panel admin). Al aprobar (ven_estado:1, "exitosa")
  // dispara el RPC approve_order que paga las comisiones multinivel de referidos y proveedores.
  update(data: any) {
    const run = async (): Promise<any> => {
      if (data.ven_estado === 1) {
        const { error } = await supabase.rpc('approve_order', { p_order_id: data.id });
        return { success: !error, data: { id: data.id } };
      }

      const patch: any = {};
      if (data.ven_estado !== undefined) patch.status = LEGACY_TO_STATUS[data.ven_estado] || 'pending';
      if (data.ven_numero_guia !== undefined) patch.tracking_number = data.ven_numero_guia;
      if (data.ven_retiro !== undefined) patch.withdrawn = data.ven_retiro;

      const { error } = await supabase.from('orders').update(patch).eq('id', data.id);
      return { success: !error, data: { id: data.id } };
    };
    return from(run());
  }

  updateDBI(query:any){
    return this._model.querys('ventasDBI/'+query.id, query, 'put');
  }
  delete(query:any){
    return this._model.querys('tblventas/'+query.id, query, 'delete');
  }
  // Genera la guia real en Mipaquete (reemplaza el createFlete viejo especifico de Coordinadora).
  // `query` es el pedido completo cargado en el formulario admin: query.id = order id,
  // query.transportadoraSelect = delivery_company_id (ver mapeo en getFleteValor, el campo "slug"
  // de cada cotizacion se llena con el id de Mipaquete, no con el nombre, para que este flujo funcione).
  createFelte(query: any) {
    const run = async (): Promise<any> => {
      if (!query.id || !query.transportadoraSelect) return { data: { status: 500 } };
      const { data: resp, error } = await supabase.functions.invoke('mipaquete-create-shipment', {
        body: { order_id: query.id, delivery_company_id: query.transportadoraSelect },
      });
      if (error || !resp || resp.error) {
        return { data: { status: 500, message: (resp && resp.error) || 'No se pudo generar la guia' } };
      }
      return { data: { status: 200, nRemesa: resp.guia, sending_id: resp.sending_id } };
    };
    return from(run());
  }

  getMontos(query:any){
    return this._model.querys('tblventas/getDineroDetalle',query, 'post');
  }

  // Cotiza con Mipaquete (reemplaza el getFleteValor viejo especifico de Coordinadora).
  // `query.id` = order id, `query.codeCiudad` = codigo DANE de destino (resuelto via getCiudades).
  getFleteValor(query: any) {
    const run = async (): Promise<any> => {
      if (!query.id || !query.codeCiudad) return { success: false, data: [] };
      const { data: resp, error } = await supabase.functions.invoke('mipaquete-quote', {
        body: { order_id: query.id, destino_dane_code: query.codeCiudad },
      });
      if (error || !resp || resp.error) return { success: false, data: [] };

      const mapped = (resp.cotizaciones || []).map((c: any) => ({
        slug: c.delivery_company_id, // se usa tal cual en createFelte, no es el nombre
        imgTrasp: c.logo_url,
        fleteSin: c.flete_costo,
        fleteValor: c.flete_costo,
        fleteTotal: c.flete_costo,
        tiempoEstimado: c.tiempo_min ? Math.round(c.tiempo_min / 1440) + ' dias' : '',
        totalKilos: resp.weight_kg,
        valoracion: resp.declared_value,
        origenDestino: query.codeCiudad,
      }));

      return { success: true, data: mapped };
    };
    return from(run());
  }

  // Sin equivalente directo en Mipaquete (era especifico de la API vieja de Coordinadora); no-op.
  cancelarFlete(query: any) {
    return from(Promise.resolve({ success: false, data: { message: 'Cancelacion manual: contactar a Mipaquete directamente' } }));
  }
  imprimirFlete(query: any) {
    return from(Promise.resolve({ success: false, data: {} }));
  }
  imprimirEvidencia(query: any) {
    return from(Promise.resolve({ success: false, data: {} }));
  }
  getFletesInter(query: any) {
    return from(Promise.resolve({ success: false, data: {} }));
  }

  // Tracking real de una guia ya generada.
  getFletes(query: any) {
    const orderId = query && (query.id || (query.where && query.where.id));
    const run = async (): Promise<any> => {
      if (!orderId) return { success: false, data: [] };
      const { data: resp, error } = await supabase.functions.invoke('mipaquete-track', { body: { order_id: orderId } });
      if (error || !resp || resp.error) return { success: false, data: [] };
      return { success: true, data: resp.tracking || [] };
    };
    return from(run());
  }

  // Buscador de ciudad destino (reemplaza el listado viejo de ciudades del backend muerto).
  getCiudades(query: any) {
    const q = (query && query.q) || (query && query.where && query.where.name && query.where.name.contains) || '';
    const run = async (): Promise<any> => {
      const { data: resp, error } = await supabase.functions.invoke('mipaquete-locations', { body: { q } });
      if (error || !resp || !resp.success) return { success: false, data: [] };
      return { success: true, data: resp.data };
    };
    return from(run());
  }
  // "Posibles ventas" (VentasDBI) es una funcionalidad separada del checkout normal que nunca se
  // migro a Supabase (tabla vieja sin equivalente nuevo). Se deja sin datos para no seguir pegandole
  // al backend muerto; el badge del header simplemente muestra 0 hasta que se decida si se migra.
  getPossibleSales( query:any ){
    return from(Promise.resolve({ success: true, data: [], count: 0 }));
  }
  getVentasProveedores( query:any ){
    return this._model.querys('tblventas/ventasProveedoresView',query, 'post');
  }
}
