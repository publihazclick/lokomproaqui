import { Injectable } from '@angular/core';
import { ServiciosService } from '../services/servicios.service';
import { supabase } from '../services/supabase.client';
import { from } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class WalletService {

  constructor(
    private _model: ServiciosService
  ) { }

  // Saldo actual de la billetera prepago del dropshipper.
  getBalance(profileId: string) {
    const run = async (): Promise<any> => {
      if (!profileId) return { success: false, data: { balance: 0 } };
      const { data, error } = await supabase
        .from('wallet_balances')
        .select('balance')
        .eq('profile_id', profileId)
        .eq('wallet_type', 'dropshipper')
        .maybeSingle();
      if (error) return { success: false, data: { balance: 0 } };
      return { success: true, data: { balance: (data && data.balance) || 0 } };
    };
    return from(run());
  }

  // Debita producto+flete de la billetera; falla limpio (sin tocar nada) si no hay saldo.
  debit(profileId: string, amount: number, orderId: number) {
    const run = async (): Promise<any> => {
      const { error } = await supabase.rpc('debit_wallet', {
        p_profile_id: profileId, p_wallet_type: 'dropshipper', p_amount: amount, p_order_id: orderId,
      });
      if (error) {
        const msg = error.message && error.message.includes('saldo_insuficiente')
          ? 'Saldo insuficiente en tu billetera, recarga para continuar'
          : 'No pudimos procesar el pago con tu billetera';
        return { success: false, message: msg };
      }
      return { success: true };
    };
    return from(run());
  }

  // Reversa un debito (ej. el usuario cancela porque no se pudo generar la guia).
  refund(profileId: string, amount: number, orderId: number) {
    const run = async (): Promise<any> => {
      const { error } = await supabase.rpc('credit_wallet', {
        p_profile_id: profileId, p_wallet_type: 'dropshipper', p_amount: amount, p_order_id: orderId, p_pct: null,
      });
      return { success: !error };
    };
    return from(run());
  }

  // Registra la intencion de recarga ANTES de abrir el checkout de ePayco (mismo patron que
  // recharge.service.createUser: el webhook la confirma cuando ePayco avisa que el pago fue aceptado).
  createTopup(profileId: string, amount: number, code: string) {
    const run = async (): Promise<any> => {
      const { data, error } = await supabase.from('wallet_topups')
        .insert({ profile_id: profileId, amount, code, status: 0 }).select().single();
      if (error || !data) return { success: false, data: null };
      return { success: true, data };
    };
    return from(run());
  }

  // Consulta si ya llego la confirmacion del webhook para una recarga (polling simple desde el frontend).
  getTopupStatus(code: string) {
    const run = async (): Promise<any> => {
      const { data, error } = await supabase.from('wallet_topups').select('*').eq('code', code).maybeSingle();
      if (error || !data) return { success: false, data: null };
      return { success: true, data };
    };
    return from(run());
  }
}
