import { Injectable } from '@angular/core';
import { ServiciosService } from '../services/servicios.service';
import { supabase } from '../services/supabase.client';
import { from } from 'rxjs';

function mapPayoutToLegacy(p: any) {
  return { id: p.id, user: p.profile_id, bank: p.bank_id, amount: p.amount, fechaPago: p.paid_at, state: p.state, photo: p.receipt_photo_url };
}

@Injectable({
  providedIn: 'root'
})
export class SupplierAccountantService {

  constructor(
    private _model: ServiciosService
  ) { }

  get(query: any) {
    const where = (query && query.where) || {};
    const run = async (): Promise<any> => {
      let q = supabase.from('supplier_payouts').select('*').order('created_at', { ascending: false });
      if (where.user) q = q.eq('profile_id', where.user);
      if (where.state !== undefined) q = q.eq('state', where.state);
      const { data, error } = await q;
      if (error || !data) return { success: false, data: [] };
      return { success: true, data: data.map(mapPayoutToLegacy) };
    };
    return from(run());
  }

  create(data: any) {
    const run = async (): Promise<any> => {
      const { data: inserted, error } = await supabase.from('supplier_payouts').insert({
        profile_id: data.user, bank_id: data.bank || null, amount: data.amount, state: data.state !== undefined ? data.state : 0, receipt_photo_url: data.photo || null,
      }).select().single();
      if (error || !inserted) return { success: false };
      return { success: true, data: mapPayoutToLegacy(inserted) };
    };
    return from(run());
  }

  update(data: any) {
    const run = async (): Promise<any> => {
      const patch: any = {};
      if (data.amount !== undefined) patch.amount = data.amount;
      if (data.state !== undefined) { patch.state = data.state; if (data.state === 1) patch.paid_at = new Date().toISOString(); }
      if (data.photo !== undefined) patch.receipt_photo_url = data.photo;
      const { error } = await supabase.from('supplier_payouts').update(patch).eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }

  delete(data: any) {
    const run = async (): Promise<any> => {
      const { error } = await supabase.from('supplier_payouts').delete().eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }
}
