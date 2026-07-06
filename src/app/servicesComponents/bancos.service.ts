import { Injectable } from '@angular/core';
import { ServiciosService } from '../services/servicios.service';
import { supabase } from '../services/supabase.client';
import { from } from 'rxjs';

function mapBankToLegacy(b: any) {
  return {
    id: b.id, user: b.profile_id, bank: b.bank_name, numeroCuenta: b.account_number,
    accounType: b.account_type, numberCC: b.id_number, nameHeadline: b.account_holder_name,
  };
}

@Injectable({
  providedIn: 'root'
})
export class BancosService {

  constructor(
    private _model: ServiciosService
  ) { }

  get(query: any) {
    const where = (query && query.where) || {};
    const run = async (): Promise<any> => {
      let q = supabase.from('banks').select('*');
      if (where.user) q = q.eq('profile_id', where.user);
      if (where.id) q = q.eq('id', where.id);
      const { data, error } = await q;
      if (error || !data) return { success: false, data: [] };
      return { success: true, data: data.map(mapBankToLegacy) };
    };
    return from(run());
  }

  create(data: any) {
    const run = async (): Promise<any> => {
      const { data: inserted, error } = await supabase.from('banks').insert({
        profile_id: data.user, bank_name: data.bank, account_number: data.numeroCuenta,
        account_type: data.accounType, id_number: data.numberCC, account_holder_name: data.nameHeadline,
      }).select().single();
      if (error || !inserted) return { success: false };
      return { success: true, data: mapBankToLegacy(inserted) };
    };
    return from(run());
  }

  update(data: any) {
    const run = async (): Promise<any> => {
      const patch: any = {};
      if (data.bank !== undefined) patch.bank_name = data.bank;
      if (data.numeroCuenta !== undefined) patch.account_number = data.numeroCuenta;
      if (data.accounType !== undefined) patch.account_type = data.accounType;
      if (data.numberCC !== undefined) patch.id_number = data.numberCC;
      if (data.nameHeadline !== undefined) patch.account_holder_name = data.nameHeadline;
      const { error } = await supabase.from('banks').update(patch).eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }

  delete(data: any) {
    const run = async (): Promise<any> => {
      const { error } = await supabase.from('banks').delete().eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }
}
