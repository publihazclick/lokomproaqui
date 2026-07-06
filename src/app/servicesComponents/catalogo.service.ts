import { Injectable } from '@angular/core';
import { ServiciosService } from '../services/servicios.service';
import { supabase } from '../services/supabase.client';
import { from } from 'rxjs';

function mapCatalogToLegacy(c: any) {
  return { id: c.id, titulo: c.title, estado: c.status, precio: c.price, preciomayor: c.wholesale_price };
}

function mapCatalogItemToLegacy(i: any) {
  return { id: i.id, catalago: i.catalog_id, producto: i.product_id, foto: i.image_url };
}

@Injectable({
  providedIn: 'root'
})
export class CatalogoService {

  constructor(
    private _model: ServiciosService
  ) { }

  get(query: any) {
    const where = (query && query.where) || {};
    const run = async (): Promise<any> => {
      let q = supabase.from('catalogs').select('*');
      if (where.id) q = q.eq('id', where.id);
      if (where.estado !== undefined) q = q.eq('status', where.estado);
      const { data, error } = await q;
      if (error || !data) return { success: false, data: [] };
      return { success: true, data: data.map(mapCatalogToLegacy) };
    };
    return from(run());
  }

  create(data: any) {
    const run = async (): Promise<any> => {
      const { data: inserted, error } = await supabase.from('catalogs').insert({
        title: data.titulo, status: data.estado !== undefined ? data.estado : 1, price: data.precio, wholesale_price: data.preciomayor,
      }).select().single();
      if (error || !inserted) return { success: false };
      return { success: true, data: mapCatalogToLegacy(inserted) };
    };
    return from(run());
  }

  update(data: any) {
    const run = async (): Promise<any> => {
      const patch: any = {};
      if (data.titulo !== undefined) patch.title = data.titulo;
      if (data.estado !== undefined) patch.status = data.estado;
      if (data.precio !== undefined) patch.price = data.precio;
      if (data.preciomayor !== undefined) patch.wholesale_price = data.preciomayor;
      const { error } = await supabase.from('catalogs').update(patch).eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }

  delete(data: any) {
    const run = async (): Promise<any> => {
      const { error } = await supabase.from('catalogs').delete().eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }

  getDetallado(query: any) {
    const where = (query && query.where) || {};
    const run = async (): Promise<any> => {
      let q = supabase.from('catalog_items').select('*, products(id, name, image_url, client_sale_price)');
      if (where.catalago) q = q.eq('catalog_id', where.catalago);
      const { data, error } = await q;
      if (error || !data) return { success: false, data: [] };
      return { success: true, data: data.map((i: any) => ({ ...mapCatalogItemToLegacy(i), producto: i.products })) };
    };
    return from(run());
  }

  createDetallado(data: any) {
    const run = async (): Promise<any> => {
      const { data: inserted, error } = await supabase.from('catalog_items').insert({
        catalog_id: data.catalago, product_id: data.producto, image_url: data.foto,
      }).select().single();
      if (error || !inserted) return { success: false };
      return { success: true, data: mapCatalogItemToLegacy(inserted) };
    };
    return from(run());
  }

  updateDetallado(data: any) {
    const run = async (): Promise<any> => {
      const patch: any = {};
      if (data.foto !== undefined) patch.image_url = data.foto;
      const { error } = await supabase.from('catalog_items').update(patch).eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }

  deleteDetallado(data: any) {
    const run = async (): Promise<any> => {
      const { error } = await supabase.from('catalog_items').delete().eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }

  FormatoBase64(foto: any) {
    return Promise.resolve(foto);
  }
}
