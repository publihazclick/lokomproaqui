import { Injectable } from '@angular/core';
import { ServiciosService } from '../services/servicios.service';
import { supabase } from '../services/supabase.client';
import { from } from 'rxjs';

function mapGroupToLegacy(g: any) {
  return { id: g.id, empresa: g.name, usuario: g.owner_profile_id };
}

@Injectable({
  providedIn: 'root'
})
export class EmpresaService {

  constructor(
    private _model: ServiciosService
  ) { }

  get(query: any) {
    const where = (query && query.where) || {};
    const run = async (): Promise<any> => {
      let q = supabase.from('groups').select('*');
      if (where.id) q = q.eq('id', where.id);
      if (where.usuario) q = q.eq('owner_profile_id', where.usuario);
      const { data, error } = await q;
      if (error || !data) return { success: false, data: [] };
      return { success: true, data: data.map(mapGroupToLegacy) };
    };
    return from(run());
  }

  create(data: any) {
    const run = async (): Promise<any> => {
      const { data: inserted, error } = await supabase.from('groups').insert({
        name: data.empresa, owner_profile_id: data.usuario || null,
      }).select().single();
      if (error || !inserted) return { success: false };
      return { success: true, data: mapGroupToLegacy(inserted) };
    };
    return from(run());
  }

  update(data: any) {
    const run = async (): Promise<any> => {
      const patch: any = {};
      if (data.empresa !== undefined) patch.name = data.empresa;
      const { error } = await supabase.from('groups').update(patch).eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }

  delete(data: any) {
    const run = async (): Promise<any> => {
      const { error } = await supabase.from('groups').delete().eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }

}
