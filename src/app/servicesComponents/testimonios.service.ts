import { Injectable } from '@angular/core';
import { ServiciosService } from '../services/servicios.service';
import { supabase } from '../services/supabase.client';
import { from } from 'rxjs';

function mapTestimonialToLegacy(t: any) {
  return { id: t.id, usuario: t.profile_id, descripcion: t.description, estado: t.status };
}

@Injectable({
  providedIn: 'root'
})
export class TestimoniosService {

  constructor(
    private _model: ServiciosService
  ) { }

  get(query: any) {
    const where = (query && query.where) || {};
    const limit = query.limit || 20;
    const run = async (): Promise<any> => {
      let q = supabase.from('testimonials').select('*').order('created_at', { ascending: false }).limit(limit);
      if (where.estado !== undefined) q = q.eq('status', where.estado);
      if (where.usuario) q = q.eq('profile_id', where.usuario);
      const { data, error } = await q;
      if (error || !data) return { success: false, data: [] };
      return { success: true, data: data.map(mapTestimonialToLegacy) };
    };
    return from(run());
  }

  create(data: any) {
    const run = async (): Promise<any> => {
      const { data: inserted, error } = await supabase.from('testimonials').insert({
        profile_id: data.usuario, description: data.descripcion, status: data.estado !== undefined ? data.estado : 1,
      }).select().single();
      if (error || !inserted) return { success: false };
      return { success: true, data: mapTestimonialToLegacy(inserted) };
    };
    return from(run());
  }

  update(data: any) {
    const run = async (): Promise<any> => {
      const patch: any = {};
      if (data.descripcion !== undefined) patch.description = data.descripcion;
      if (data.estado !== undefined) patch.status = data.estado;
      const { error } = await supabase.from('testimonials').update(patch).eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }

  delete(data: any) {
    const run = async (): Promise<any> => {
      const { error } = await supabase.from('testimonials').delete().eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }
}
