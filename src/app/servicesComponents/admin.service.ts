import { Injectable } from '@angular/core';
import { ServiciosService } from '../services/servicios.service';
import { supabase } from '../services/supabase.client';
import { from } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AdminService {

  constructor(
    private _model: ServiciosService
  ) { }

  get(query: any) {
    const run = async (): Promise<any> => {
      const { data, error } = await supabase.from('site_config').select('*').limit(1).single();
      if (error || !data) return { success: false, data: [] };
      return { success: true, data: [{ id: data.id, banners: data.banners, ...data.info_text }] };
    };
    return from(run());
  }
  // site_config es un singleton (una sola fila sembrada en la migracion inicial); tanto crear
  // como actualizar terminan escribiendo sobre esa misma fila.
  create(data: any) {
    return this.update(data);
  }

  update(data: any) {
    const run = async (): Promise<any> => {
      const { id, banners, ...rest } = data;
      const patch: any = {};
      if (banners !== undefined) patch.banners = banners;
      if (Object.keys(rest).length) patch.info_text = rest;

      let q = supabase.from('site_config').update(patch);
      q = id ? q.eq('id', id) : q.not('id', 'is', null);
      const { error } = await q;
      return { success: !error };
    };
    return from(run());
  }

  delete(query: any) {
    return from(Promise.resolve({ success: true }));
  }
}
