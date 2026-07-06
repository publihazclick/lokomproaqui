import { Injectable } from '@angular/core';
import { ServiciosService } from '../services/servicios.service';
import { supabase } from '../services/supabase.client';
import { from } from 'rxjs';

function mapEntryToLegacy(e: any) {
  return { id: e.id, tpEntrada: e.entry_type, fecha: e.entry_date, descripcion: e.description, estado: e.status, user: e.profile_id };
}

function mapEntryItemToLegacy(i: any) {
  return { id: i.id, producto: i.product_id, cantidad: i.quantity, color: null, talla: null, fecha: i.entry_date, provedorEntrada: i.entry_id };
}

@Injectable({
  providedIn: 'root'
})
export class ControlinventarioService {

  constructor(
    private _model: ServiciosService
  ) { }

  get(query: any) {
    const where = (query && query.where) || {};
    const run = async (): Promise<any> => {
      let q = supabase.from('supplier_stock_entries').select('*').order('entry_date', { ascending: false });
      if (where.user) q = q.eq('profile_id', where.user);
      const { data, error } = await q;
      if (error || !data) return { success: false, data: [] };
      return { success: true, data: data.map(mapEntryToLegacy) };
    };
    return from(run());
  }

  create(data: any) {
    const run = async (): Promise<any> => {
      const { data: inserted, error } = await supabase.from('supplier_stock_entries').insert({
        entry_type: data.tpEntrada || 1, description: data.descripcion, status: data.estado !== undefined ? data.estado : 1, profile_id: data.user,
      }).select().single();
      if (error || !inserted) return { success: false, data: null };
      return { success: true, data: mapEntryToLegacy(inserted) };
    };
    return from(run());
  }

  update(data: any) {
    const run = async (): Promise<any> => {
      const patch: any = {};
      if (data.tpEntrada !== undefined) patch.entry_type = data.tpEntrada;
      if (data.descripcion !== undefined) patch.description = data.descripcion;
      if (data.estado !== undefined) patch.status = data.estado;
      const { error } = await supabase.from('supplier_stock_entries').update(patch).eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }

  delete(data: any) {
    const run = async (): Promise<any> => {
      const { error } = await supabase.from('supplier_stock_entries').delete().eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }

  getProductos(query: any) {
    const where = (query && query.where) || {};
    const run = async (): Promise<any> => {
      let q = supabase.from('supplier_stock_entry_items').select('*');
      if (where.provedorEntrada) q = q.eq('entry_id', where.provedorEntrada);
      const { data, error } = await q;
      if (error || !data) return { success: false, data: [] };
      return { success: true, data: data.map(mapEntryItemToLegacy) };
    };
    return from(run());
  }

  createProductos(data: any) {
    const run = async (): Promise<any> => {
      const { data: inserted, error } = await supabase.from('supplier_stock_entry_items').insert({
        entry_id: data.provedorEntrada, product_id: data.producto, quantity: data.cantidad,
      }).select().single();
      if (error || !inserted) return { success: false };
      return { success: true, data: mapEntryItemToLegacy(inserted) };
    };
    return from(run());
  }

  updateProductos(data: any) {
    const run = async (): Promise<any> => {
      const patch: any = {};
      if (data.cantidad !== undefined) patch.quantity = data.cantidad;
      const { error } = await supabase.from('supplier_stock_entry_items').update(patch).eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }

  deleteProductos(data: any) {
    const run = async (): Promise<any> => {
      const { error } = await supabase.from('supplier_stock_entry_items').delete().eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }

}
