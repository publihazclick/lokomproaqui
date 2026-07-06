import { Injectable } from '@angular/core';
import { ServiciosService } from '../services/servicios.service';
import { supabase } from '../services/supabase.client';
import { from } from 'rxjs';

function mapWithdrawalToLegacy(w: any) {
  return {
    id: w.id,
    usu_clave_int: w.profile_id,
    cob_num_cedula: w.id_document,
    cob_num_celular: w.phone,
    cob_num_cuenta: w.bank_account_number,
    cob_nombre_banco: w.bank_name,
    cob_metodo: w.method,
    cob_monto: w.amount,
    cob_estado: w.status,
    sumaFlete: w.freight_deduction,
    devoluciones: w.returns_deduction,
    totalrecibir: w.net_amount != null ? w.net_amount : w.amount,
    createdAt: w.created_at,
  };
}

@Injectable({
  providedIn: 'root'
})
export class CobrosService {

  constructor(
    private _model: ServiciosService
  ) { }

  get(query: any) {
    const where = (query && query.where) || {};
    const page = query.page || 0;
    const limit = query.limit || 10;

    const run = async (): Promise<any> => {
      let q = supabase.from('withdrawal_requests').select('*', { count: 'exact' });
      if (where.usu_clave_int) q = q.eq('profile_id', where.usu_clave_int);
      if (where.cob_estado !== undefined) q = q.eq('status', where.cob_estado);
      q = q.order('created_at', { ascending: false }).range(page * limit, page * limit + limit - 1);

      const { data, error, count } = await q;
      if (error || !data) return { success: false, data: [], count: 0 };
      return { success: true, data: data.map(mapWithdrawalToLegacy), count: count != null ? count : data.length };
    };
    return from(run());
  }

  create(data: any) {
    const run = async (): Promise<any> => {
      const { data: inserted, error } = await supabase.from('withdrawal_requests').insert({
        profile_id: data.usu_clave_int,
        id_document: data.cob_num_cedula,
        phone: data.cob_num_celular,
        bank_account_number: data.cob_num_cuenta,
        bank_name: data.cob_metodo,
        method: data.cob_metodo,
        amount: data.cob_monto,
      }).select().single();
      if (error || !inserted) return { success: false, data: null };
      return { success: true, data: mapWithdrawalToLegacy(inserted) };
    };
    return from(run());
  }

  validador(query: any) {
    // El sistema viejo validaba fechas de corte de pago; sin esa regla de negocio por ahora, siempre habilitado.
    return from(Promise.resolve({ success: true, data: { disponible: true } }));
  }

  // Aprobar/rechazar un retiro dispara el RPC process_withdrawal_request, que deja el balance de billetera en cero.
  update(data: any) {
    const run = async (): Promise<any> => {
      if (data.cob_estado === 1 || data.cob_estado === 2) {
        const { error } = await supabase.rpc('process_withdrawal_request', {
          p_request_id: data.id,
          p_action: data.cob_estado === 1 ? 'approve' : 'reject',
        });
        return { success: !error, data: { id: data.id } };
      }

      const patch: any = {};
      if (data.cob_num_cuenta !== undefined) patch.bank_account_number = data.cob_num_cuenta;
      if (data.cob_metodo !== undefined) { patch.method = data.cob_metodo; patch.bank_name = data.cob_metodo; }
      const { error } = await supabase.from('withdrawal_requests').update(patch).eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }

  delete(data: any) {
    const run = async (): Promise<any> => {
      const { error } = await supabase.from('withdrawal_requests').delete().eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }

}
