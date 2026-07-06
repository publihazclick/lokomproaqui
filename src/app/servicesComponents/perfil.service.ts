import { Injectable } from '@angular/core';
import { ServiciosService } from '../services/servicios.service';
import { supabase } from '../services/supabase.client';
import { from } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class PerfilService {

  constructor(
    private _model: ServiciosService
  ) { }

  // Roles fijos (admin/vendedor/proveedor/bodega) sembrados en la migracion inicial; el panel
  // admin ya no puede crear roles nuevos libremente como hacia el sistema viejo.
  get(query: any) {
    const run = async (): Promise<any> => {
      const { data, error } = await supabase.from('roles').select('*').order('id');
      if (error || !data) return { success: false, data: [] };
      return { success: true, data: data.map((r: any) => ({ id: r.id, prf_descripcion: r.name })) };
    };
    return from(run());
  }

  create(query: any) {
    return from(Promise.resolve({ success: true }));
  }
  update(query: any) {
    return from(Promise.resolve({ success: true }));
  }
  delete(query: any) {
    return from(Promise.resolve({ success: true }));
  }

  getCategoria(query: any) {
    const run = async (): Promise<any> => {
      const { data, error } = await supabase.from('seller_tiers').select('*').order('id');
      if (error || !data) return { success: false, data: [] };
      return { success: true, data: data.map((t: any) => ({ id: t.id, categoria: t.name, precioPorcentaje: t.markup_pct })) };
    };
    return from(run());
  }
}
