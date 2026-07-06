import { Injectable } from '@angular/core';
import { ServiciosService } from '../services/servicios.service';
import { supabase } from '../services/supabase.client';
import { from } from 'rxjs';

function mapCourseToLegacy(c: any) {
  return { id: c.id, titulo: c.title, url: c.video_url, orden: c.sort_order, img: c.image_url, padre: c.parent_id, descripcion: c.description };
}

@Injectable({
  providedIn: 'root'
})
export class CursosService {

  constructor(
    private _model: ServiciosService
  ) { }

  get(query: any) {
    const where = (query && query.where) || {};
    const run = async (): Promise<any> => {
      let q = supabase.from('courses').select('*').order('sort_order');
      if (where.padre !== undefined) q = where.padre === null ? q.is('parent_id', null) : q.eq('parent_id', where.padre);
      const { data, error } = await q;
      if (error || !data) return { success: false, data: [] };
      return { success: true, data: data.map(mapCourseToLegacy) };
    };
    return from(run());
  }

  create(data: any) {
    const run = async (): Promise<any> => {
      const { data: inserted, error } = await supabase.from('courses').insert({
        title: data.titulo, video_url: data.url, sort_order: data.orden || 0, image_url: data.img, parent_id: data.padre || null, description: data.descripcion,
      }).select().single();
      if (error || !inserted) return { success: false };
      return { success: true, data: mapCourseToLegacy(inserted) };
    };
    return from(run());
  }

  update(data: any) {
    const run = async (): Promise<any> => {
      const patch: any = {};
      if (data.titulo !== undefined) patch.title = data.titulo;
      if (data.url !== undefined) patch.video_url = data.url;
      if (data.orden !== undefined) patch.sort_order = data.orden;
      if (data.img !== undefined) patch.image_url = data.img;
      if (data.padre !== undefined) patch.parent_id = data.padre;
      if (data.descripcion !== undefined) patch.description = data.descripcion;
      const { error } = await supabase.from('courses').update(patch).eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }

  delete(data: any) {
    const run = async (): Promise<any> => {
      const { error } = await supabase.from('courses').delete().eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }

}
