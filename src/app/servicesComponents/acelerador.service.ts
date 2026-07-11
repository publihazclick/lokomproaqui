import { Injectable } from '@angular/core';
import { ServiciosService } from '../services/servicios.service';
import { supabase } from '../services/supabase.client';
import { from } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AceleradorService {

  constructor(
    private _model: ServiciosService
  ) { }

  // ── Vitrina/suscriptor ────────────────────────────────────────────────────────────────────

  hasAccess(profileId: string) {
    const run = async (): Promise<any> => {
      if (!profileId) return { success: true, data: false };
      const { data, error } = await supabase.rpc('acelerador_has_access', { p_profile_id: profileId });
      if (error) return { success: false, data: false };
      return { success: true, data: !!data };
    };
    return from(run());
  }

  getModulesWithLessons() {
    const run = async (): Promise<any> => {
      const [{ data: modules, error: modErr }, { data: lessons, error: lesErr }] = await Promise.all([
        supabase.from('acelerador_modules').select('*').order('sort_order'),
        supabase.from('acelerador_lessons').select('id, module_id, title, description, sort_order, thumbnail_url, duration_seconds').order('sort_order'),
      ]);
      if (modErr || lesErr || !modules) return { success: false, data: [] };
      const data = modules.map((m: any) => ({ ...m, lessons: (lessons || []).filter((l: any) => l.module_id === m.id) }));
      return { success: true, data };
    };
    return from(run());
  }

  // Registra la intencion de pago ANTES de abrir el checkout de ePayco (mismo patron que
  // WalletService.createTopup): el webhook confirma cuando ePayco avisa que fue aceptado.
  createPayment(profileId: string, amount: number, code: string) {
    const run = async (): Promise<any> => {
      const { data, error } = await supabase.from('acelerador_payments')
        .insert({ profile_id: profileId, amount, code, status: 0 }).select().single();
      if (error || !data) return { success: false, data: null };
      return { success: true, data };
    };
    return from(run());
  }

  getPaymentStatus(code: string) {
    const run = async (): Promise<any> => {
      const { data, error } = await supabase.from('acelerador_payments').select('*').eq('code', code).maybeSingle();
      if (error || !data) return { success: false, data: null };
      return { success: true, data };
    };
    return from(run());
  }

  // Pide el link firmado (corta duracion) de una leccion puntual. La verificacion real de
  // suscripcion vigente ocurre DENTRO de la Edge Function, no aqui.
  getSignedUrl(lessonId: number) {
    const run = async (): Promise<any> => {
      const { data, error } = await supabase.functions.invoke('acelerador-signed-url', {
        body: { lesson_id: lessonId },
      });
      if (error || !data || data.error) {
        return { success: false, message: (data && data.error) || 'No pudimos cargar el video' };
      }
      return { success: true, url: data.url, expiresIn: data.expires_in };
    };
    return from(run());
  }

  // ── Admin: modulos ────────────────────────────────────────────────────────────────────────

  getModules() {
    const run = async (): Promise<any> => {
      const { data, error } = await supabase.from('acelerador_modules').select('*').order('sort_order');
      if (error || !data) return { success: false, data: [] };
      return { success: true, data };
    };
    return from(run());
  }

  createModule(data: any) {
    const run = async (): Promise<any> => {
      const { data: inserted, error } = await supabase.from('acelerador_modules')
        .insert({ title: data.title, sort_order: data.sort_order || 0 }).select().single();
      if (error || !inserted) return { success: false, data: null };
      return { success: true, data: inserted };
    };
    return from(run());
  }

  updateModule(data: any) {
    const run = async (): Promise<any> => {
      const patch: any = {};
      if (data.title !== undefined) patch.title = data.title;
      if (data.sort_order !== undefined) patch.sort_order = data.sort_order;
      const { error } = await supabase.from('acelerador_modules').update(patch).eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }

  deleteModule(id: number) {
    const run = async (): Promise<any> => {
      const { error } = await supabase.from('acelerador_modules').delete().eq('id', id);
      return { success: !error };
    };
    return from(run());
  }

  // ── Admin: lecciones ──────────────────────────────────────────────────────────────────────

  getLessons(moduleId?: number) {
    const run = async (): Promise<any> => {
      let q = supabase.from('acelerador_lessons').select('*').order('sort_order');
      if (moduleId) q = q.eq('module_id', moduleId);
      const { data, error } = await q;
      if (error || !data) return { success: false, data: [] };
      return { success: true, data };
    };
    return from(run());
  }

  createLesson(data: any) {
    const run = async (): Promise<any> => {
      const { data: inserted, error } = await supabase.from('acelerador_lessons').insert({
        module_id: data.module_id,
        title: data.title,
        description: data.description || null,
        sort_order: data.sort_order || 0,
        video_path: data.video_path,
        thumbnail_url: data.thumbnail_url || null,
        duration_seconds: data.duration_seconds || null,
      }).select().single();
      if (error || !inserted) return { success: false, data: null };
      return { success: true, data: inserted };
    };
    return from(run());
  }

  updateLesson(data: any) {
    const run = async (): Promise<any> => {
      const patch: any = {};
      if (data.module_id !== undefined) patch.module_id = data.module_id;
      if (data.title !== undefined) patch.title = data.title;
      if (data.description !== undefined) patch.description = data.description;
      if (data.sort_order !== undefined) patch.sort_order = data.sort_order;
      if (data.video_path !== undefined) patch.video_path = data.video_path;
      if (data.thumbnail_url !== undefined) patch.thumbnail_url = data.thumbnail_url;
      if (data.duration_seconds !== undefined) patch.duration_seconds = data.duration_seconds;
      const { error } = await supabase.from('acelerador_lessons').update(patch).eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }

  deleteLesson(id: number) {
    const run = async (): Promise<any> => {
      const { error } = await supabase.from('acelerador_lessons').delete().eq('id', id);
      return { success: !error };
    };
    return from(run());
  }
}
