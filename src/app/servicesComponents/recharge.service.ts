import { Injectable } from '@angular/core';
import { ServiciosService } from '../services/servicios.service';
import { supabase } from '../services/supabase.client';
import { from } from 'rxjs';

function mapRechargeToLegacy(r: any) {
  return { id: r.id, titulo: r.title, descripcion: r.description, estado: r.status, foto: r.image_url, precio: r.price };
}

function mapRechargeUserToLegacy(r: any) {
  return {
    id: r.id, recarga: r.recharge_product_id, user: r.profile_id,
    estado: r.status, valor: r.amount, codigo: r.code, idTransfer: r.epayco_transaction_id,
  };
}

@Injectable({
  providedIn: 'root'
})
export class RechargeService {

  constructor(
    private _model: ServiciosService
  ) { }

  get(query: any) {
    const run = async (): Promise<any> => {
      const { data, error } = await supabase.from('recharge_products').select('*').eq('status', 1).order('id');
      if (error || !data) return { success: false, data: [] };
      return { success: true, data: data.map(mapRechargeToLegacy) };
    };
    return from(run());
  }

  create(data: any) {
    const run = async (): Promise<any> => {
      const { data: inserted, error } = await supabase.from('recharge_products').insert({
        title: data.titulo, description: data.descripcion, status: data.estado !== undefined ? data.estado : 1, image_url: data.foto, price: data.precio,
      }).select().single();
      if (error || !inserted) return { success: false };
      return { success: true, data: mapRechargeToLegacy(inserted) };
    };
    return from(run());
  }

  update(data: any) {
    const run = async (): Promise<any> => {
      const patch: any = {};
      if (data.titulo !== undefined) patch.title = data.titulo;
      if (data.descripcion !== undefined) patch.description = data.descripcion;
      if (data.estado !== undefined) patch.status = data.estado;
      if (data.foto !== undefined) patch.image_url = data.foto;
      if (data.precio !== undefined) patch.price = data.precio;
      const { error } = await supabase.from('recharge_products').update(patch).eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }

  delete(data: any) {
    const run = async (): Promise<any> => {
      const { error } = await supabase.from('recharge_products').delete().eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }

  // Registra la intencion de compra ANTES de abrir el checkout de ePayco (igual que el sistema viejo:
  // se crea el registro, y el webhook lo confirma cuando ePayco avisa que el pago fue aceptado).
  getUser(query: any) {
    const where = (query && query.where) || {};
    const run = async (): Promise<any> => {
      let q = supabase.from('recharge_purchases').select('*');
      if (where.user) q = q.eq('profile_id', where.user);
      if (where.codigo) q = q.eq('code', where.codigo);
      const { data, error } = await q.order('created_at', { ascending: false });
      if (error || !data) return { success: false, data: [] };
      return { success: true, data: data.map(mapRechargeUserToLegacy) };
    };
    return from(run());
  }

  createUser(data: any) {
    const run = async (): Promise<any> => {
      const { data: inserted, error } = await supabase.from('recharge_purchases').insert({
        recharge_product_id: data.recarga,
        profile_id: data.user,
        amount: data.valor,
        code: data.codigo,
        status: 0,
      }).select().single();
      if (error || !inserted) return { success: false, data: null };
      return { success: true, data: mapRechargeUserToLegacy(inserted) };
    };
    return from(run());
  }

  updateUser(data: any) {
    const run = async (): Promise<any> => {
      const patch: any = {};
      if (data.estado !== undefined) patch.status = data.estado;
      const { error } = await supabase.from('recharge_purchases').update(patch).eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }

  deleteUser(data: any) {
    const run = async (): Promise<any> => {
      const { error } = await supabase.from('recharge_purchases').delete().eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }

  // Consulta si ya llego la confirmacion del webhook para un codigo de compra (polling simple desde el frontend).
  getValidateRecharge(query: any) {
    const codigo = query && (query.codigo || (query.where && query.where.codigo));
    const run = async (): Promise<any> => {
      const { data, error } = await supabase.from('recharge_purchases').select('*').eq('code', codigo).maybeSingle();
      if (error || !data) return { success: false, data: null };
      return { success: true, data: mapRechargeUserToLegacy(data) };
    };
    return from(run());
  }
}
