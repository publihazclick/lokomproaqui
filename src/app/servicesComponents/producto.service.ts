import { Injectable } from '@angular/core';
import { ServiciosService } from '../services/servicios.service';
import { supabase } from '../services/supabase.client';
import { from } from 'rxjs';

// Convierte una fila de `products` (+ variantes/categoria) al formato viejo de Tblproductos,
// reconstruyendo el JSON `listColor` que las plantillas existentes todavia leen.
function mapProductToLegacy(product: any, computedPrice?: number) {
  const variantsByColor: any = {};
  for (const v of product.product_variants || []) {
    const color = v.color || 'unico';
    if (!variantsByColor[color]) {
      variantsByColor[color] = { talla: color, foto: product.image_url, tallaSelect: [], galeriaList: [] };
    }
    variantsByColor[color].tallaSelect.push({
      id: v.id,
      tal_descripcion: v.sizes ? v.sizes.name : '',
      cantidad: v.stock,
      check: v.stock > 0,
    });
  }

  return {
    id: product.id,
    pro_nombre: product.name,
    pro_palabra: product.slug,
    foto: product.image_url,
    pro_descripcion: product.description,
    pro_descripcionbreve: product.short_description,
    pro_marca: product.brand,
    pro_categoria: product.categories ? { id: product.categories.id, cat_nombre: product.categories.name } : null,
    pro_codigo: product.code,
    pro_activo: product.active ? 0 : 1, // convencion vieja: 0 = activo
    pro_mostrar_agotado: product.show_when_sold_out,
    pro_uni_venta: computedPrice != null ? computedPrice : product.client_sale_price,
    pro_vendedor: null,
    pro_usu_creacion: product.owner_profile_id,
    pro_sw_tallas: product.size_type_id,
    listColor: Object.values(variantsByColor),
    galeria: [],
    listaGaleria: product.gallery || [],
    listDetalles: product.details || [],
    checkMayor: product.wholesale_enabled,
    listComment: [],
  };
}

const PRODUCT_SELECT = '*, categories:categories!products_category_id_fkey(id, name), product_variants(*, sizes(name))';
const PRODUCT_WITH_OWNER_SELECT = '*, profiles!products_owner_profile_id_fkey(full_name, avatar_url)';

// Banners estaticos del home (nunca dependieron de datos, eran hardcodeados igual en el backend viejo).
const HOME_BANNERS = [
  { id: 0, title: '', image: './assets/imagenes/banner2.png', thumbImage: './assets/imagenes/banner2.png' },
  { id: 1, title: '', image: './assets/imagenes/banner3.png', thumbImage: './assets/imagenes/banner3.png' },
  { id: 2, title: '', image: './assets/imagenes/banner4.png', thumbImage: './assets/imagenes/banner4.png' },
];

// Reemplaza todas las variantes de un producto a partir del `listColor` que arma el formulario admin.
// El tamaño se resuelve por NOMBRE (tal_descripcion) contra `sizes`, no por id, porque el mismo campo
// `tallaSelect[].id` significa cosas distintas segun si viene de una plantilla de tallas o de un producto
// ya guardado (mismo comportamiento ambiguo que tenia el sistema viejo).
async function syncVariants(productId: number, sizeTypeId: any, listColor: any[]) {
  await supabase.from('product_variants').delete().eq('product_id', productId);
  if (!listColor || !listColor.length) return;

  const rows: any[] = [];
  for (const colorGroup of listColor) {
    for (const size of (colorGroup.tallaSelect || [])) {
      if (!size.check) continue;
      let sizeId: any = null;
      if (size.tal_descripcion && sizeTypeId) {
        const { data: sizeRow } = await supabase
          .from('sizes').select('id')
          .eq('size_type_id', sizeTypeId).eq('name', size.tal_descripcion).maybeSingle();
        sizeId = sizeRow ? sizeRow.id : null;
      }
      rows.push({ product_id: productId, color: colorGroup.talla || null, size_id: sizeId, stock: Number(size.cantidad) || 0 });
    }
  }
  if (rows.length) await supabase.from('product_variants').insert(rows);
}

function slugify(text: string) {
  return (text || 'producto').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);
}

@Injectable({
  providedIn: 'root'
})
export class ProductoService {

  constructor(
    private _model: ServiciosService
  ) { }

  get(query: any) {
    const where = (query && query.where) || {};
    const page = query.page || 0;
    const limit = query.limit || 10;

    const run = async (): Promise<any> => {
      let q = supabase.from('products').select(PRODUCT_SELECT, { count: 'exact' });

      // pro_activo explicito (panel admin: 0 activo, 1 eliminado) vs catalogo publico (siempre activo)
      if (where.pro_activo !== undefined) q = q.eq('active', where.pro_activo === 0);
      else q = q.eq('active', true);

      if (where.id) q = q.eq('id', where.id);
      if (where.codigo) q = q.eq('code', where.codigo);
      if (where.pro_categoria && where.pro_categoria !== 0) q = q.eq('category_id', where.pro_categoria);
      if (where.pro_usu_creacion) q = q.eq('owner_profile_id', where.pro_usu_creacion);
      if (where.or && where.or.length) {
        const term = (where.or[0].pro_nombre && where.or[0].pro_nombre.contains) || (where.or[0].pro_codigo && where.or[0].pro_codigo.contains) || '';
        if (term) q = q.or(`name.ilike.%${term}%,code.ilike.%${term}%`);
      }
      if (typeof query.sort === 'string' && query.sort.indexOf('createdAt') === 0) {
        q = q.order('created_at', { ascending: query.sort.toUpperCase().indexOf('ASC') > -1 });
      } else {
        q = q.order('position', { ascending: true });
      }

      q = q.range(page * limit, page * limit + limit - 1);

      const { data, error, count } = await q;
      if (error || !data) return { success: false, data: [], count: 0 };

      const sellerId = where.user || where.idPrice;
      let overrides: any[] = [];
      if (sellerId) {
        const { data: po } = await supabase.from('price_overrides').select('*').eq('profile_id', sellerId).eq('active', true);
        overrides = po || [];
      }

      const mapped = data.map((p: any) => {
        const override = overrides.find((o) => o.product_id === p.id);
        return mapProductToLegacy(p, override ? override.price : undefined);
      });

      return { success: true, data: mapped, count: count != null ? count : mapped.length };
    };

    return from(run());
  }

  // Equivalente a "mi tienda": productos que un vendedor agregó a su catálogo con precio propio (price_overrides).
  getStore(query: any) {
    const where = (query && query.where) || {};
    const sellerId = where.user || where.idPrice;
    const page = query.page || 0;
    const limit = query.limit || 10;

    const run = async (): Promise<any> => {
      if (!sellerId) return { success: true, data: [], count: 0 };
      let q = supabase
        .from('price_overrides')
        .select(`price, products(${PRODUCT_SELECT})`, { count: 'exact' })
        .eq('profile_id', sellerId)
        .eq('active', true)
        .range(page * limit, page * limit + limit - 1);

      const { data, error, count } = await q;
      if (error || !data) return { success: false, data: [], count: 0 };

      const mapped = data.filter((row: any) => row.products).map((row: any) => mapProductToLegacy(row.products, row.price));
      return { success: true, data: mapped, count: count != null ? count : mapped.length };
    };

    return from(run());
  }

  create(data: any) {
    const run = async (): Promise<any> => {
      const { data: inserted, error } = await supabase.from('products').insert({
        name: data.pro_nombre,
        slug: slugify(data.pro_nombre),
        image_url: data.foto,
        description: data.pro_descripcion,
        brand: data.pro_marca,
        category_id: data.pro_categoria || null,
        subcategory_id: data.pro_sub_categoria || null,
        active: data.pro_activo === undefined || data.pro_activo === 0,
        code: data.pro_codigo,
        owner_profile_id: data.pro_usu_creacion || null,
        client_sale_price: data.pro_uni_venta,
        size_type_id: data.pro_sw_tallas || null,
        gallery: data.listaGaleria || [],
        width: data.ancho || null, height: data.alto || null, length: data.largo || null, weight: data.peso || null,
      }).select().single();

      if (error || !inserted) return { success: false, data: null };
      await syncVariants(inserted.id, data.pro_sw_tallas, data.listColor);
      return { success: true, data: { id: inserted.id } };
    };
    return from(run());
  }

  update(data: any) {
    const run = async (): Promise<any> => {
      const patch: any = {};
      if (data.pro_nombre !== undefined) patch.name = data.pro_nombre;
      if (data.pro_descripcion !== undefined) patch.description = data.pro_descripcion;
      if (data.pro_marca !== undefined) patch.brand = data.pro_marca;
      if (data.pro_categoria !== undefined) patch.category_id = data.pro_categoria;
      if (data.pro_sub_categoria !== undefined) patch.subcategory_id = data.pro_sub_categoria;
      if (data.pro_uni_venta !== undefined) patch.client_sale_price = data.pro_uni_venta;
      if (data.pro_codigo !== undefined) patch.code = data.pro_codigo;
      if (data.foto !== undefined) patch.image_url = data.foto;
      if (data.pro_sw_tallas !== undefined) patch.size_type_id = data.pro_sw_tallas;
      if (data.pro_usu_creacion !== undefined) patch.owner_profile_id = data.pro_usu_creacion;
      if (data.listaGaleria !== undefined) patch.gallery = data.listaGaleria;
      if (data.pro_activo !== undefined) patch.active = data.pro_activo === 0;

      const { error } = await supabase.from('products').update(patch).eq('id', data.id);
      if (error) return { success: false };

      if (data.listColor) await syncVariants(data.id, data.pro_sw_tallas, data.listColor);
      return { success: true, data: { id: data.id } };
    };
    return from(run());
  }

  // Toggle simple de visibilidad (el sistema viejo tenia un flag `pro_estado` separado del soft-delete
  // `pro_activo`; aqui se unifican en el mismo booleano `active`).
  updateState(data: any) {
    const run = async (): Promise<any> => {
      const isActive = data.pro_estado !== undefined ? !!data.pro_estado : true;
      const { error } = await supabase.from('products').update({ active: isActive }).eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }

  updateCache(query:any){
    return from(Promise.resolve({ success: true }));
  }

  delete(data: any) {
    const run = async (): Promise<any> => {
      const { error } = await supabase.from('products').delete().eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }
  // "Ultimas publicaciones de proveedores" en el home: un producto activo por tarjeta con el
  // nombre/foto del dueño. `_feedOffset` trackea la paginacion de "ver mas" (el componente llama
  // siempre con `{}`, sin cursor, igual que hacia el backend viejo).
  private _feedOffset = 0;

  private async _productFeed(offset: number, limit: number) {
    const { data, error } = await supabase
      .from('products')
      .select(PRODUCT_WITH_OWNER_SELECT)
      .eq('active', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error || !data) return [];
    return data.map((p: any) => ({
      title: 'Productos Nuevos con alto margen de ganancia',
      article: [{ id: p.id, foto: p.image_url, title: p.name }],
      user: { usu_usuario: p.profiles ? p.profiles.full_name : '', usu_imagen: p.profiles ? p.profiles.avatar_url : '' },
    }));
  }

  getListInit(query: any) {
    this._feedOffset = 20;
    const run = async (): Promise<any> => ({ data: await this._productFeed(0, 20) });
    return from(run());
  }

  getListgeMore(query: any) {
    const run = async (): Promise<any> => {
      const data = await this._productFeed(this._feedOffset, 20);
      this._feedOffset += 20;
      return { data };
    };
    return from(run());
  }

  // "Novedades": los productos activos mas recientes.
  getListgetNews(query: any) {
    const run = async (): Promise<any> => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, image_url')
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(6);
      if (error || !data) return { data: [] };
      return { data: data.map((p: any) => ({ tipe: 1, title: p.name, article: [{ id: p.id, foto: p.image_url, title: p.name }] })) };
    };
    return from(run());
  }

  getListgetBanner(query: any) {
    return from(Promise.resolve({ data: HOME_BANNERS }));
  }

  // Reordenamiento manual (drag&drop) del catalogo admin, usa la columna `position` de products.
  ordenar(query: any) {
    const run = async (): Promise<any> => {
      const lista = (query && query.lista) || [];
      for (let i = 0; i < lista.length; i++) {
        await supabase.from('products').update({ position: i }).eq('id', lista[i].id);
      }
      return { success: true };
    };
    return from(run());
  }
  // Panel "mis despacho": listado de items de pedidos de un proveedor agrupados por estado de la
  // guia. Reemplaza validateMoneySupplier (que distinguia "aprobado pero no pagado al proveedor" vs
  // "ya pagado"): en el sistema nuevo esa distincion no existe, el pago se acredita al instante al
  // aprobar (approve_order), asi que ya no hay un estado intermedio "aprobado sin pagar".
  private static readonly ORDER_STATUS_TO_LEGACY: any = { pending: 0, success: 1, rejected: 2, dispatched: 3, invoiced: 4, deleted: 5, preparing: 6 };

  private async _supplierOrderItems(profileId: any, statuses: string[], extra?: (q: any) => any) {
    if (!profileId) return { data: [], total: 0 };
    let q = supabase
      .from('order_items')
      .select('*, products!inner(name, owner_profile_id), orders!inner(*)')
      .eq('products.owner_profile_id', profileId);
    if (statuses.length) q = q.in('orders.status', statuses);
    if (extra) q = extra(q);

    const { data, error } = await q;
    if (error || !data) return { data: [], total: 0 };

    const rows = data.map((item: any) => ({
      id: item.id,
      ventas: {
        id: item.orders.id,
        ven_estado: ProductoService.ORDER_STATUS_TO_LEGACY[item.orders.status] != null ? ProductoService.ORDER_STATUS_TO_LEGACY[item.orders.status] : 0,
        ven_numero_guia: item.orders.tracking_number,
        transportadoraSelect: item.orders.carrier,
        ven_telefono_cliente: item.orders.buyer_phone,
        ven_nombre_cliente: item.orders.buyer_name,
        ven_subVendedor: 0,
      },
      producto: { pro_nombre: item.products ? item.products.name : item.title },
      tallaSelect: item.size,
      colorSelect: item.color,
      cantidad: item.quantity,
      createdAt: item.orders.created_at,
      precioVendedor: item.total_cost || 0,
      pricePlatform: 0, // el RPC actual acredita el 100% de total_cost al proveedor, sin descuento de plataforma
    }));
    const total = rows.reduce((s: number, r: any) => s + (r.precioVendedor - r.pricePlatform), 0);
    return { data: rows, total, count: rows.length };
  }

  // Detalle de un item puntual (usado al abrir el dialogo de una guia especifica).
  getVenta(query: any) {
    const where = (query && query.where) || {};
    const run = async (): Promise<any> => {
      if (!where.id) return { success: false, data: [] };
      const { data, error } = await supabase
        .from('order_items')
        .select('*, products(name), orders(*)')
        .eq('id', where.id)
        .maybeSingle();
      if (error || !data) return { success: false, data: [] };
      const row = {
        id: data.id,
        ventas: {
          id: data.orders ? data.orders.id : null,
          ven_estado: data.orders ? (ProductoService.ORDER_STATUS_TO_LEGACY[data.orders.status] != null ? ProductoService.ORDER_STATUS_TO_LEGACY[data.orders.status] : 0) : 0,
          ven_numero_guia: data.orders ? data.orders.tracking_number : null,
          transportadoraSelect: data.orders ? data.orders.carrier : null,
          ven_telefono_cliente: data.orders ? data.orders.buyer_phone : null,
          ven_nombre_cliente: data.orders ? data.orders.buyer_name : null,
          ven_subVendedor: 0,
        },
        producto: { pro_nombre: data.products ? data.products.name : data.title },
        tallaSelect: data.size,
        colorSelect: data.color,
        cantidad: data.quantity,
        createdAt: data.orders ? data.orders.created_at : null,
        precioVendedor: data.total_cost || 0,
        pricePlatform: 0,
      };
      return { success: true, data: [row] };
    };
    return from(run());
  }

  // "Reacaudo pendiente para pagar": saldo de billetera tipo supplier (se acredita al instante al
  // aprobar el pedido). Ya no existe un bucket "aprobado sin pagar" (data siempre vacio).
  getVentaComplete(query: any) {
    const profileId = query && query.where && query.where.creacion;
    const run = async (): Promise<any> => {
      if (!profileId) return { total: 0, data: [], count: 0 };
      const { data, error } = await supabase
        .from('wallet_balances')
        .select('balance')
        .eq('profile_id', profileId)
        .eq('wallet_type', 'supplier')
        .maybeSingle();
      if (error || !data) return { total: 0, data: [], count: 0 };
      return { total: data.balance || 0, data: [], count: 0 };
    };
    return from(run());
  }

  // Ganancia por flete cuando la tienda paga el transporte de compra; concepto muy especifico del
  // backend viejo sin dato equivalente todavia en el esquema nuevo. Se deja en 0 documentado.
  getVentaCompleteEarningBuy(query: any) {
    return from(Promise.resolve({ total: 0, data: [], count: 0 }));
  }

  // "GUIAS DESPACHADAS"
  getVentaCompleteEarring(query: any) {
    const profileId = query && query.where && query.where.creacion;
    const run = async (): Promise<any> => this._supplierOrderItems(profileId, ['dispatched']);
    return from(run());
  }

  // "GUIAS POR IMPRIMIR": aprobadas, sin guia generada todavia.
  getVentaCompletePendients(query: any) {
    const profileId = query && query.where && query.where.creacion;
    const run = async (): Promise<any> => this._supplierOrderItems(profileId, ['success'], (q: any) => q.is('orders.tracking_number', null));
    return from(run());
  }

  // "GUIAS COMPLETADAS" / "GUIAS PAGADAS AL PROVEEDOR": aprobadas (con guia o sin ella, ya pagadas
  // al proveedor siempre, sea cual sea el estado de la guia).
  getVentaCompleteComplete(query: any) {
    const profileId = query && query.where && query.where.creacion;
    const run = async (): Promise<any> => this._supplierOrderItems(profileId, ['success']);
    return from(run());
  }

  // Items ya incluidos en un pago especifico a proveedor (reemplaza getPaymentBuy, ahora via la
  // columna real order_items.supplier_payout_id que ya usa supplier-accountant.service).
  getVentaCompletePago(query: any) {
    const payoutId = query && query.checkPaySupplier;
    const run = async (): Promise<any> => {
      if (!payoutId) return { success: true, data: [] };
      const { data, error } = await supabase
        .from('order_items')
        .select('*, products(name), orders(*)')
        .eq('supplier_payout_id', payoutId);
      if (error || !data) return { success: false, data: [] };
      const rows = data.map((item: any) => ({
        id: item.id,
        producto: { pro_nombre: item.products ? item.products.name : item.title },
        tallaSelect: item.size,
        colorSelect: item.color,
        cantidad: item.quantity,
        precioVendedor: item.total_cost || 0,
        pricePlatform: 0,
      }));
      return { success: true, data: rows };
    };
    return from(run());
  }

  // "GUIAS EN DEVOLUCION"
  getVentaDevolution(query: any) {
    const profileId = query && query.where && query.where.creacion;
    const run = async (): Promise<any> => this._supplierOrderItems(profileId, ['rejected']);
    return from(run());
  }

  // "GUÍAS EN PREPARACIÓN"
  getTransactionsPreparacion(query: any) {
    const profileId = query && query.where && query.where.creacion;
    const run = async (): Promise<any> => this._supplierOrderItems(profileId, ['preparing']);
    return from(run());
  }
  // Pendiente: comentario publico (anonimo, con nombre/email libres) sobre un producto especifico.
  // Necesita una tabla nueva (`testimonials` no sirve: es por profile_id, sin product_id/nombre/email
  // libres) — requiere autorizacion explicita del usuario para la migracion de esquema, pendiente.
  createTestimonio(query: any) {
    return from(Promise.resolve({ success: false, data: null }));
  }

  // Agrega/reactiva un producto en la tienda propia del revendedor con su precio de venta
  // (reemplaza PriceArticle por `price_overrides`, mismo esquema que ya usan get()/getStore()).
  createPrice(data: any) {
    const run = async (): Promise<any> => {
      if (!data.user) return { success: false, data: 'Error userId no indeficate' };
      const { data: existing } = await supabase.from('price_overrides').select('id')
        .eq('product_id', data.article).eq('profile_id', data.user).maybeSingle();
      if (existing) {
        await supabase.from('price_overrides').update({ price: data.price, active: true }).eq('id', existing.id);
      } else {
        await supabase.from('price_overrides').insert({ product_id: data.article, profile_id: data.user, price: data.price, active: true });
      }
      return { success: true, data: 'Creado exitoso' };
    };
    return from(run());
  }

  // Consulta puntual: ¿el usuario ya tiene este articulo en su tienda? (usado al abrir la vista de un producto)
  getPrice(query: any) {
    const where = (query && query.where) || {};
    const run = async (): Promise<any> => {
      let q = supabase.from('price_overrides').select('*');
      if (where.article) q = q.eq('product_id', where.article);
      if (where.user) q = q.eq('profile_id', where.user);
      if (where.state !== undefined) q = q.eq('active', where.state === 0);
      const { data, error } = await q;
      if (error || !data) return { success: false, data: [] };
      return { success: true, data: data.map((r: any) => ({ id: r.id, price: r.price, article: r.product_id, user: r.profile_id })) };
    };
    return from(run());
  }

  // Listado paginado de "mis productos" (tienda del revendedor), con el producto completo embebido
  // (reemplaza querysProducts, que poblaba `article` con el producto).
  getPriceArticle(query: any) {
    const where = (query && query.where) || {};
    const page = query.page || 0;
    const limit = query.limit || 10;
    const run = async (): Promise<any> => {
      if (where.id) {
        const { data, error } = await supabase.from('price_overrides').select(`*, products(${PRODUCT_SELECT})`).eq('id', where.id).maybeSingle();
        if (error || !data) return { success: false, data: [] };
        return { success: true, data: [{ id: data.id, price: data.price, article: data.products ? mapProductToLegacy(data.products, data.price) : null }] };
      }

      let q = supabase.from('price_overrides').select(`*, products(${PRODUCT_SELECT})`, { count: 'exact' });
      if (where.user) q = q.eq('profile_id', where.user);
      if (where.state !== undefined) q = q.eq('active', where.state === 0);
      q = q.range(page * limit, page * limit + limit - 1);

      const { data, error, count } = await q;
      if (error || !data) return { success: false, data: [], count: 0 };
      const mapped = data.filter((r: any) => r.products).map((r: any) => ({ id: r.id, price: r.price, article: mapProductToLegacy(r.products, r.price) }));
      return { success: true, data: mapped, count: count != null ? count : mapped.length };
    };
    return from(run());
  }

  // Editar precio o desactivar/reactivar un articulo de la tienda propia (state 0 activo, 1 inactivo).
  updatePriceArticle(query: any) {
    const run = async (): Promise<any> => {
      const patch: any = {};
      if (query.state !== undefined) patch.active = query.state === 0;
      if (query.price !== undefined) patch.price = query.price;
      const { error } = await supabase.from('price_overrides').update(patch).eq('id', query.id);
      return { success: !error };
    };
    return from(run());
  }

  // Agrega de una vez TODOS los productos activos de una bodega/proveedor (`data.create`) a la
  // tienda del usuario, saltando los que ya tiene (botón "agregar todos" al ver una bodega).
  createPriceArticleFull(data: any) {
    const run = async (): Promise<any> => {
      if (!data.user) return { success: false, data: 'Error userId no indeficate' };
      const { data: products } = await supabase.from('products').select('id, client_sale_price').eq('owner_profile_id', data.create).eq('active', true);
      if (!products || !products.length) return { success: true, data: 'Creado exitoso' };

      const { data: existing } = await supabase.from('price_overrides').select('product_id')
        .eq('profile_id', data.user).in('product_id', products.map((p: any) => p.id));
      const existingIds = new Set((existing || []).map((e: any) => e.product_id));

      const rows = products.filter((p: any) => !existingIds.has(p.id))
        .map((p: any) => ({ product_id: p.id, profile_id: data.user, price: p.client_sale_price || 0, active: true }));
      if (rows.length) await supabase.from('price_overrides').insert(rows);

      return { success: true, data: 'Creado exitoso' };
    };
    return from(run());
  }

}
