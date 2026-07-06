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

  create(query:any){
    return this._model.querys('tbltipotalla',query, 'post');
  }

  createTallas(query:any){
    return this._model.querys('tbltallas',query, 'post');
  }

  update(query:any){
    return this._model.querys('tbltipotalla/'+query.id, query, 'put');
  }
  updateTalla(query:any){
    return this._model.querys('tbltallas/'+query.id, query, 'put');
  }
  delete(query:any){
    return this._model.querys('tbltipotalla/'+query.id, query, 'delete');
  }
}
