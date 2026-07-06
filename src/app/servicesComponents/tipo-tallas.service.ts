import { Injectable } from '@angular/core';
import { ServiciosService } from '../services/servicios.service';
import { supabase } from '../services/supabase.client';
import { from } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TipoTallasService {

  constructor(
    private _model: ServiciosService
  ) { }

  get(query: any) {
    const run = async (): Promise<any> => {
      const { data, error } = await supabase.from('size_types').select('*').eq('active', true).order('sort_order');
      if (error || !data) return { success: false, data: [] };
      const mapped = data.map((t: any) => ({ id: t.id, tit_descripcion: t.name, tit_sw_activo: t.active, ordenar: t.sort_order }));
      return { success: true, data: mapped };
    };
    return from(run());
  }

  getTalla(query: any) {
    const where = (query && query.where) || {};
    const run = async (): Promise<any> => {
      let q = supabase.from('sizes').select('*').eq('active', true).order('sort_order');
      if (where.tal_tipo) q = q.eq('size_type_id', where.tal_tipo);
      const { data, error } = await q;
      if (error || !data) return { success: false, data: [] };
      const mapped = data.map((s: any) => ({ id: s.id, tal_descripcion: s.name, tal_tipo: s.size_type_id, tal_sw_activo: s.active, ordenar: s.sort_order }));
      return { success: true, data: mapped };
    };
    return from(run());
  }

  create(data: any) {
    const run = async (): Promise<any> => {
      const { data: inserted, error } = await supabase.from('size_types').insert({
        name: data.tit_descripcion, active: data.tit_sw_activo === undefined || Number(data.tit_sw_activo) === 0, sort_order: data.ordenar || 0,
      }).select().single();
      if (error || !inserted) return { success: false };
      return { success: true, id: inserted.id };
    };
    return from(run());
  }

  createTallas(data: any) {
    const run = async (): Promise<any> => {
      const { data: inserted, error } = await supabase.from('sizes').insert({
        name: data.tal_descripcion, size_type_id: data.tal_tipo, active: data.tal_sw_activo === undefined || Number(data.tal_sw_activo) === 0, sort_order: data.ordenar || 0,
      }).select().single();
      if (error || !inserted) return { success: false };
      return { success: true, id: inserted.id };
    };
    return from(run());
  }

  update(data: any) {
    const run = async (): Promise<any> => {
      const patch: any = {};
      if (data.tit_descripcion !== undefined) patch.name = data.tit_descripcion;
      if (data.tit_sw_activo !== undefined) patch.active = Number(data.tit_sw_activo) === 0;
      if (data.ordenar !== undefined) patch.sort_order = data.ordenar;
      const { error } = await supabase.from('size_types').update(patch).eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }

  updateTalla(data: any) {
    const run = async (): Promise<any> => {
      const patch: any = {};
      if (data.tal_descripcion !== undefined) patch.name = data.tal_descripcion;
      if (data.tal_sw_activo !== undefined) patch.active = Number(data.tal_sw_activo) === 0;
      if (data.ordenar !== undefined) patch.sort_order = data.ordenar;
      const { error } = await supabase.from('sizes').update(patch).eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }
}
