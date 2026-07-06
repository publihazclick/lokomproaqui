import { Injectable } from '@angular/core';
import { ServiciosService } from '../services/servicios.service';
import { supabase } from '../services/supabase.client';
import { from } from 'rxjs';

function mapOrderItemToLegacy(i: any) {
  return {
    id: i.id, ventas: i.order_id, producto: i.product_id, titulo: i.title, precio: i.unit_price,
    cantidad: i.quantity, tallaSelect: i.size, colorSelect: i.color, comision: i.commission_pct,
    precioVendedor: i.seller_cost, costoTotal: i.total_cost,
  };
}

@Injectable({
  providedIn: 'root'
})
export class VentasProductosService {

  constructor(
    private _model: ServiciosService
  ) { }

  get(query: any) {
    const where = (query && query.where) || {};
    const run = async (): Promise<any> => {
      let q = supabase.from('order_items').select('*');
      if (where.ventas) q = q.eq('order_id', where.ventas);
      if (where.producto) q = q.eq('product_id', where.producto);
      const { data, error } = await q;
      if (error || !data) return { success: false, data: [] };
      return { success: true, data: data.map(mapOrderItemToLegacy) };
    };
    return from(run());
  }

  create(data: any) {
    const run = async (): Promise<any> => {
      const { data: inserted, error } = await supabase.from('order_items').insert({
        order_id: data.ventas, product_id: data.producto, title: data.titulo, unit_price: data.precio,
        quantity: data.cantidad, size: data.tallaSelect, color: data.colorSelect,
        commission_pct: data.comision, seller_cost: data.precioVendedor, total_cost: data.costoTotal,
      }).select().single();
      if (error || !inserted) return { success: false };
      return { success: true, data: mapOrderItemToLegacy(inserted) };
    };
    return from(run());
  }

  update(data: any) {
    const run = async (): Promise<any> => {
      const patch: any = {};
      if (data.cantidad !== undefined) patch.quantity = data.cantidad;
      if (data.precio !== undefined) patch.unit_price = data.precio;
      if (data.costoTotal !== undefined) patch.total_cost = data.costoTotal;
      const { error } = await supabase.from('order_items').update(patch).eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }

  delete(data: any) {
    const run = async (): Promise<any> => {
      const { error } = await supabase.from('order_items').delete().eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }
}
