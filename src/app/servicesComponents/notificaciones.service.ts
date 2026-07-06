import { Injectable } from '@angular/core';
import { ServiciosService } from '../services/servicios.service';
import { supabase } from '../services/supabase.client';
import { from } from 'rxjs';

function mapNotificationToLegacy(n: any) {
  return {
    id: n.id, titulo: n.title, foto: n.image_url, tipoDe: n.type, admin: n.is_admin,
    descripcion: n.description, venta: n.order_id, user: n.profile_id, view: n.read, createdAt: n.created_at,
  };
}

@Injectable({
  providedIn: 'root'
})
export class NotificacionesService {

  constructor(
    private _model: ServiciosService
  ) { }

  get(query: any) {
    const where = (query && query.where) || {};
    const limit = query.limit || 50;
    const run = async (): Promise<any> => {
      let q = supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit);
      if (where.user) q = q.eq('profile_id', where.user);
      if (where.admin !== undefined) q = q.eq('is_admin', where.admin);
      if (where.view !== undefined) q = q.eq('read', where.view);
      const { data, error } = await q;
      if (error || !data) return { success: false, data: [] };
      return { success: true, data: data.map(mapNotificationToLegacy) };
    };
    return from(run());
  }

  create(data: any) {
    const run = async (): Promise<any> => {
      const { data: inserted, error } = await supabase.from('notifications').insert({
        title: data.titulo, image_url: data.foto, type: data.tipoDe || 0, is_admin: !!data.admin,
        description: data.descripcion, order_id: data.venta || null, profile_id: data.user || null,
      }).select().single();
      if (error || !inserted) return { success: false };
      return { success: true, data: mapNotificationToLegacy(inserted) };
    };
    return from(run());
  }

  update(data: any) {
    const run = async (): Promise<any> => {
      const patch: any = {};
      if (data.view !== undefined) patch.read = data.view;
      if (data.descripcion !== undefined) patch.description = data.descripcion;
      const { error } = await supabase.from('notifications').update(patch).eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }

  delete(data: any) {
    const run = async (): Promise<any> => {
      const { error } = await supabase.from('notifications').delete().eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }
}
