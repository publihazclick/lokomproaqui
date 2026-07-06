import { Injectable } from '@angular/core';
import { ServiciosService } from '../services/servicios.service';
import { supabase } from '../services/supabase.client';
import { from } from 'rxjs';

function mapCategoryToLegacy(cat: any) {
  return {
    id: cat.id,
    cat_nombre: cat.name,
    cat_palabra: cat.slug,
    cat_descripcion: cat.description,
    cat_padre: cat.parent_id,
    cat_activo: cat.active ? 0 : 1, // convencion vieja: 0 = activo
    cat_imagen: cat.image_url,
    ordenador: cat.sort_order,
  };
}

@Injectable({
  providedIn: 'root'
})
export class CategoriasService {

  constructor(
    private _model: ServiciosService
  ) { }

  getAll(query: any) {
    return this.get(query);
  }

  get(query: any) {
    const where = (query && query.where) || {};
    const limit = query.limit || 1000;

    const run = async (): Promise<any> => {
      let q = supabase.from('categories').select('*').order('sort_order').limit(limit);
      if (where.cat_padre === null) q = q.is('parent_id', null);
      else if (where.cat_padre !== undefined) q = q.eq('parent_id', where.cat_padre);
      if (where.id) q = q.eq('id', where.id);
      if (where.cat_activo !== undefined) q = q.eq('active', Number(where.cat_activo) === 0);
      if (where.or && where.or.length) {
        const term = (where.or[0].cat_nombre && where.or[0].cat_nombre.contains) || (where.or[0].cat_descripcion && where.or[0].cat_descripcion.contains) || '';
        if (term) q = q.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
      }

      const { data, error } = await q;
      if (error || !data) return { success: false, data: [] };
      return { success: true, data: data.map(mapCategoryToLegacy) };
    };

    return from(run());
  }

  create(data: any) {
    const run = async (): Promise<any> => {
      const { data: inserted, error } = await supabase.from('categories').insert({
        name: data.cat_nombre,
        slug: (data.cat_nombre || 'categoria').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36),
        description: data.cat_descripcion || null,
        parent_id: data.cat_padre || null,
        active: data.cat_activo === undefined || Number(data.cat_activo) === 0,
        image_url: data.cat_imagen || null,
        sort_order: data.ordenador || 0,
      }).select().single();
      if (error || !inserted) return { success: false, data: null };
      return { success: true, data: mapCategoryToLegacy(inserted) };
    };
    return from(run());
  }

  update(data: any) {
    const run = async (): Promise<any> => {
      const patch: any = {};
      if (data.cat_nombre !== undefined) patch.name = data.cat_nombre;
      if (data.cat_descripcion !== undefined) patch.description = data.cat_descripcion;
      if (data.cat_padre !== undefined) patch.parent_id = data.cat_padre;
      if (data.cat_activo !== undefined) patch.active = Number(data.cat_activo) === 0;
      if (data.cat_imagen !== undefined) patch.image_url = data.cat_imagen;
      if (data.ordenador !== undefined) patch.sort_order = data.ordenador;

      const { error } = await supabase.from('categories').update(patch).eq('id', data.id);
      return { success: !error, data: { id: data.id } };
    };
    return from(run());
  }

  delete(data: any) {
    const run = async (): Promise<any> => {
      const { error } = await supabase.from('categories').delete().eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }
  createUser(query:any){
    return this._model.querys('tblusuarioCategoria',query, 'post');
  }
  getUser(query:any){
    return this._model.querys('tblusuarioCategoria/querys',query, 'post');
  }
}
