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
  getListInit(query:any){
    return this._model.querys('tblproductos/getInit',query, 'post');
  }
  getListgetNews(query:any){
    return this._model.querys('tblproductos/getNews',query, 'post');
  }
  getListgeMore(query:any){
    return this._model.querys('tblproductos/getMore',query, 'post');
  }
  getListgetBanner(query:any){
    return this._model.querys('tblproductos/getBanners',query, 'post');
  }
  ordenar(query:any){
    return this._model.querys('tblproductos/ordenar', query, 'post');
  }
  getVenta(query:any){
    return this._model.querys('tblventasproducto/querys',query, 'post');
  }
  getVentaComplete(query:any){
    return this._model.querys('tblventas/getTransactions',query, 'post');
  }
  getVentaCompleteEarningBuy(query:any){
    return this._model.querys('tblventas/getTransactionsEarringBuyTrasnport',query, 'post');
  }
  getVentaCompleteEarring(query:any){
    return this._model.querys('tblventas/getTransactionsEarring',query, 'post');
  }
  getVentaCompletePendients(query:any){
    return this._model.querys('tblventas/getTransactionsPendients',query, 'post');
  }
  getVentaCompleteComplete(query:any){
    return this._model.querys('tblventas/getTransactionsComplete',query, 'post');
  }
  getVentaCompletePago(query:any){
    return this._model.querys('tblventas/getTransactionsPagados',query, 'post');
  }
  getVentaDevolution(query:any){
    return this._model.querys('tblventas/getTransactionsDevolution',query, 'post');
  }
  getTransactionsPreparacion(query:any){
    return this._model.querys('tblventas/getTransactionsPreparacion',query, 'post');
  }
  createTestimonio(query:any){
    return this._model.querys('tbltestimonio',query, 'post');
  }
  createPrice( query:any ){
    return this._model.querys('priceArticle',query, 'post');
  }
  getPrice( query:any ){
    return this._model.querys('priceArticle/querys',query, 'post');
  }
  getPriceArticle( query:any ){
    return this._model.querys('priceArticle/querysProducts',query, 'post');
  }
  updatePriceArticle( query:any ){
    return this._model.querys('priceArticle/'+query.id,query, 'put');
  }
  createPriceArticleFull( query:any ){
    return this._model.querys('priceArticle/createTotalProduct',query, 'post');
  }

}
