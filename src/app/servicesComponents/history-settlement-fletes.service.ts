import { Injectable } from '@angular/core';
import { ServiciosService } from '../services/servicios.service';
import { supabase } from '../services/supabase.client';
import { from } from 'rxjs';

function mapLogToLegacy(l: any) {
  return { id: l.id, dataTxt: JSON.stringify(l.data), estado: l.status, venta: l.order_id, user: l.profile_id, createdAt: l.created_at };
}

@Injectable({
  providedIn: 'root'
})
export class HistorySettlementFletesService {

  constructor(
    private _model: ServiciosService
  ) { }

  get(query: any) {
    const where = (query && query.where) || {};
    const run = async (): Promise<any> => {
      let q = supabase.from('shipment_settlement_logs').select('*').order('created_at', { ascending: false });
      if (where.venta) q = q.eq('order_id', where.venta);
      if (where.user) q = q.eq('profile_id', where.user);
      const { data, error } = await q;
      if (error || !data) return { success: false, data: [] };
      return { success: true, data: data.map(mapLogToLegacy) };
    };
    return from(run());
  }

  create(data: any) {
    const run = async (): Promise<any> => {
      const { data: inserted, error } = await supabase.from('shipment_settlement_logs').insert({
        order_id: data.venta, profile_id: data.user, data: data.dataTxt ? JSON.parse(data.dataTxt) : {}, status: data.estado !== undefined ? data.estado : 1,
      }).select().single();
      if (error || !inserted) return { success: false };
      return { success: true, data: mapLogToLegacy(inserted) };
    };
    return from(run());
  }

  update(data: any) {
    const run = async (): Promise<any> => {
      const patch: any = {};
      if (data.estado !== undefined) patch.status = data.estado;
      const { error } = await supabase.from('shipment_settlement_logs').update(patch).eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }

  delete(data: any) {
    const run = async (): Promise<any> => {
      const { error } = await supabase.from('shipment_settlement_logs').delete().eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }
}
