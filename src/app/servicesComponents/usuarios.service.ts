import { Injectable } from '@angular/core';
import { ServiciosService } from '../services/servicios.service';
import { UserAction } from '../redux/app.actions';
import { STORAGES } from '../interfaces/sotarage';
import { Store } from '@ngrx/store';
import { supabase } from '../services/supabase.client';
import { from, of } from 'rxjs';

// roles.name en Supabase usa nombres nuevos ('admin'); el resto de la app compara
// contra el nombre viejo ('administrador'). Traducimos aca en el unico punto de entrada.
function legacyRoleName(name: string) {
  return name === 'admin' ? 'administrador' : name;
}

// Convierte una fila de `profiles` (+ join de roles) al formato viejo de Tblusuario
// para que los componentes existentes (usu_nombre, usu_perfil.prf_descripcion, etc.) no cambien.
function mapProfileToLegacyUser(profile: any, email: string, token?: string) {
  return {
    id: profile.id,
    usu_nombre: profile.full_name,
    usu_apellido: profile.last_name,
    usu_email: email,
    usu_telefono: profile.phone,
    usu_ciudad: profile.city,
    usu_direccion: profile.address,
    usu_documento: profile.document_id,
    usu_usuario: profile.referral_code,
    usu_imagen: profile.avatar_url,
    codigo: profile.referral_code,
    cabeza: profile.referrer_id,
    usu_perfil: { prf_descripcion: profile.roles ? legacyRoleName(profile.roles.name) : 'vendedor' },
    tokens: token,
  };
}

@Injectable({
  providedIn: 'root'
})
export class UsuariosService {

  constructor(
    private _model: ServiciosService,
    private _store: Store<STORAGES>,
  ) { }

  get(query: any) {
    const where = (query && query.where) || {};

    const run = async (): Promise<any> => {
      let q = supabase.from('profiles').select('*, roles(name)');
      if (where.id) q = q.eq('id', where.id);
      if (where.usu_telefono) q = q.eq('phone', where.usu_telefono);
      if (where.usu_usuario) q = q.eq('referral_code', where.usu_usuario);
      const { data, error } = await q;
      if (error || !data) return { success: false, data: [] };
      return { success: true, data: data.map((p: any) => mapProfileToLegacyUser(p, null)) };
    };

    return from(run());
  }

  // Listado generico de usuarios (ej. dropdown de vendedores), con filtro opcional por rol.
  getOn(query: any) {
    const where = (query && query.where) || {};
    const run = async (): Promise<any> => {
      let q = supabase.from('profiles').select('*, roles!inner(name)');
      if (where.rolName) q = q.eq('roles.name', where.rolName);
      const { data, error } = await q;
      if (error || !data) return { success: false, data: [] };
      return { success: true, data: data.map((p: any) => mapProfileToLegacyUser(p, null)) };
    };
    return from(run());
  }

  // Directorio de usuarios filtrado por rol (ej. "proveedor") y opcionalmente solo los que tienen
  // al menos un producto activo (proValidate) — usado para listar bodegas/proveedores.
  getStore(query: any) {
    const where = (query && query.where) || {};
    const page = query.page || 0;
    const limit = query.limit || 10;

    const run = async (): Promise<any> => {
      let q = supabase.from('profiles').select('*, roles!inner(name)', { count: 'exact' });
      if (where.rol) q = q.eq('roles.name', where.rol);
      if (where.pro_usu_creacion) q = q.eq('id', where.pro_usu_creacion);
      if (where.estado !== undefined) q = q.eq('status', where.estado);

      if (where.proValidate) {
        const { data: withProducts } = await supabase.from('products').select('owner_profile_id').eq('active', true);
        const ids = Array.from(new Set((withProducts || []).map((p: any) => p.owner_profile_id).filter(Boolean)));
        if (!ids.length) return { success: true, data: [], count: 0 };
        q = q.in('id', ids);
      }

      q = q.range(page * limit, page * limit + limit - 1);

      const { data, error, count } = await q;
      if (error || !data) return { success: false, data: [], count: 0 };
      const mapped = data.map((p: any) => mapProfileToLegacyUser(p, null));
      return { success: true, data: mapped, count: count != null ? count : mapped.length };
    };

    return from(run());
  }

  // Igual que getStore pero devuelve el arreglo directo (sin envoltorio {success,data}), como
  // esperaba el backend viejo.
  getStores(query: any) {
    const run = async (): Promise<any> => {
      const result: any = await this.getStore(query).toPromise();
      return (result && result.data) || [];
    };
    return from(run());
  }

  recuperacion(query:any){
    return this._model.querys('tblusuario/resetiar',query, 'post');
  }

  // El backend viejo calculaba muchos totales (ganancias, cobrado, pagado, devoluciones...) pero
  // en toda la app solo se lee `porcobrado` ("dinero pendiente por cobrar"). En el sistema nuevo
  // eso es directamente el saldo de la billetera tipo "referral" (se acredita al instante al
  // aprobar un pedido, ver approve_order), igual que se hizo para el proveedor en producto.service.
  getInfo(query: any) {
    const profileId = query && query.where && query.where.id;
    const run = async (): Promise<any> => {
      if (!profileId) return { data: { porcobrado: 0 } };
      const { data, error } = await supabase
        .from('wallet_balances')
        .select('balance')
        .eq('profile_id', profileId)
        .eq('wallet_type', 'referral')
        .maybeSingle();
      if (error || !data) return { data: { porcobrado: 0 } };
      return { data: { porcobrado: data.balance || 0 } };
    };
    return from(run());
  }

  // Bonificacion manual de puntos/ganancias por el admin: se acredita directo a la billetera de
  // referidos del usuario (reemplaza NivelServices.procesoGanacias).
  darPuntos(query: any) {
    const run = async (): Promise<any> => {
      if (!query.user || !query.ganancias) return { success: false };
      const { error } = await supabase.rpc('credit_wallet', {
        p_profile_id: query.user, p_wallet_type: 'referral', p_amount: Number(query.ganancias), p_order_id: null, p_pct: null,
      });
      return { success: !error };
    };
    return from(run());
  }

  // Cambio de clave. Solo funciona para la clave PROPIA (auth.updateUser opera sobre la sesion
  // actual) — el panel admin cambiando la clave de OTRO usuario necesitaria una funcion con
  // service_role que no existe todavia, se deja documentado como pendiente.
  cambioPass(data: any) {
    const run = async (): Promise<any> => {
      const { data: session } = await supabase.auth.getUser();
      if (!session || !session.user || session.user.id !== data.id) {
        return { success: false, data: 'No se puede cambiar la clave de otro usuario desde aqui todavia' };
      }
      const { error } = await supabase.auth.updateUser({ password: data.password });
      if (error) return { success: false, data: error.message };
      return { success: true, data: 'ok' };
    };
    return from(run());
  }

  login(query: any) {
    const run = async (): Promise<any> => {
      let email = (query.usu_email || '').trim();

      if (!email.includes('@')) {
        const { data: resolvedEmail } = await supabase.rpc('lookup_email_by_phone', { p_phone: email });
        if (!resolvedEmail) return { success: false, message: 'No encontramos una cuenta con ese celular o correo' };
        email = resolvedEmail;
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password: query.usu_clave });
      if (error || !data.session) {
        return { success: false, message: 'Correo/celular o contraseña incorrectos' };
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles').select('*, roles(name)').eq('id', data.user.id).single();
      if (profileError || !profile) {
        return { success: false, message: 'No se pudo cargar tu perfil, intenta de nuevo' };
      }

      return { success: true, data: mapProfileToLegacyUser(profile, data.user.email, data.session.access_token) };
    };

    return from(run());
  }

  create(query: any) {
    const run = async (): Promise<any> => {
      const { data, error } = await supabase.auth.signUp({
        email: query.usu_email,
        password: query.usu_clave,
        options: {
          data: {
            full_name: query.usu_nombre,
            last_name: query.usu_apellido,
            phone: query.usu_telefono,
            referrer_id: query.cabeza && query.cabeza !== 1 ? query.cabeza : null,
            role_name: query.rol,
          }
        }
      });

      if (error) {
        const msg = error.message.includes('already registered')
          ? 'Ya existe una cuenta con ese correo'
          : 'No pudimos crear tu cuenta, intenta de nuevo';
        return { success: false, data: msg, message: msg };
      }

      const { data: profile } = await supabase
        .from('profiles').select('*, roles(name)').eq('id', data.user.id).single();

      let token = data.session ? data.session.access_token : null;
      if (!token) {
        const signIn = await supabase.auth.signInWithPassword({ email: query.usu_email, password: query.usu_clave });
        token = signIn.data.session ? signIn.data.session.access_token : null;
      }

      return { success: true, data: mapProfileToLegacyUser(profile, data.user.email, token) };
    };

    return from(run());
  }

  // Autoservicio de perfil (y edicion admin de otro usuario). Devuelve el perfil completo mapeado
  // (no solo {success}) porque el store de Redux REEMPLAZA el objeto `user` entero con esta
  // respuesta (ver reducer app.ts case 'put') — hay que preservar email/token que no vienen en el patch.
  update(data: any) {
    const run = async (): Promise<any> => {
      const patch: any = {};
      if (data.usu_nombre !== undefined) patch.full_name = data.usu_nombre;
      if (data.usu_apellido !== undefined) patch.last_name = data.usu_apellido;
      if (data.usu_telefono !== undefined) patch.phone = data.usu_telefono;
      if (data.usu_documento !== undefined) patch.document_id = data.usu_documento;
      if (data.usu_ciudad !== undefined) patch.city = data.usu_ciudad;
      if (data.usu_direccion !== undefined) patch.address = data.usu_direccion;
      if (data.usu_imagen !== undefined) patch.avatar_url = data.usu_imagen;

      const { data: updated, error } = await supabase.from('profiles').update(patch).eq('id', data.id).select('*, roles(name)').single();
      if (error || !updated) return { success: false };
      return mapProfileToLegacyUser(updated, data.usu_email, data.tokens);
    };
    return from(run());
  }

  // La tabla vieja `Platform` (datos de contacto duplicados por transportadora) se elimino a
  // proposito en el Hito 7 al pasar a Mipaquete; no tiene equivalente nuevo, se deja no-op.
  updatePlatform(query: any) {
    return from(Promise.resolve({ success: true, data: 'ok' }));
  }

  // Desactiva la cuenta (no hay forma de borrar auth.users desde el cliente sin service_role).
  delete(query: any) {
    const id = query && (query.id || query);
    const run = async (): Promise<any> => {
      const { error } = await supabase.from('profiles').update({ status: 0 }).eq('id', id);
      return { success: !error };
    };
    return from(run());
  }

  createSolicitud(data: any) {
    const run = async (): Promise<any> => {
      const { data: inserted, error } = await supabase.from('onboarding_requests').insert({
        profile_id: data.user, warehouse_name: data.nombreBodega, categories: data.listCategorias || [],
      }).select().single();
      if (error || !inserted) return { success: false };
      return { success: true, data: { id: inserted.id, user: inserted.profile_id, nombreBodega: inserted.warehouse_name, listCategorias: inserted.categories } };
    };
    return from(run());
  }

  updateSolicitud(data: any) {
    const run = async (): Promise<any> => {
      const patch: any = {};
      if (data.nombreBodega !== undefined) patch.warehouse_name = data.nombreBodega;
      if (data.listCategorias !== undefined) patch.categories = data.listCategorias;
      const { error } = await supabase.from('onboarding_requests').update(patch).eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }

  deleteSolicitud(data: any) {
    const run = async (): Promise<any> => {
      const { error } = await supabase.from('onboarding_requests').delete().eq('id', data.id);
      return { success: !error };
    };
    return from(run());
  }
  // Total de dinero recaudado por un distribuidor: saldo de su billetera de referidos.
  getRecaudo(query: any) {
    const profileId = query && query.where && query.where.usuario;
    const run = async (): Promise<any> => {
      if (!profileId) return { data: [{ valor: 0 }] };
      const { data, error } = await supabase.from('wallet_balances').select('balance').eq('profile_id', profileId).eq('wallet_type', 'referral').maybeSingle();
      if (error || !data) return { data: [{ valor: 0 }] };
      return { data: [{ valor: data.balance || 0 }] };
    };
    return from(run());
  }

  // Categorias de perfil de vendedor con su porcentaje (mismo dato que seller_tiers, ya usado por
  // perfil.service.getCategoria).
  getPerfiles(query: any) {
    const run = async (): Promise<any> => {
      const { data, error } = await supabase.from('seller_tiers').select('*').order('id');
      if (error || !data) return { success: false, data: [] };
      return { success: true, data: data.map((t: any) => ({ id: t.id, categoria: t.name, precioPorcentaje: t.markup_pct })) };
    };
    return from(run());
  }
  // Envia el correo real de recuperacion via Supabase Auth. Nota: no existe todavia una pagina en
  // la app que reciba el link de recuperacion y llame a auth.updateUser({password}) — el correo se
  // manda bien, pero falta esa pantalla para completar el cambio de clave (pendiente, fuera del
  // alcance de "arreglar la llamada rota").
  olvidoPass(query: any) {
    const email = query && query.usu_email;
    const run = async (): Promise<any> => {
      if (!email) return { success: false, data: 'Falta el correo electronico' };
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      });
      if (error) return { success: false, data: error.message };
      return { success: true, data: 'Correo de recuperacion enviado' };
    };
    return from(run());
  }
    async initProcess( data:any ){
    return new Promise( async ( resolve ) =>{
      let filtro:any = await this.getValidador( data.email );
      if( filtro == false ) { await this.createUser( data ); return resolve( true ) }
      this.dataStore( filtro );
      resolve( true );
    })
  }
  async getValidador( email:string ){
    return new Promise( resolve => {
      this.get( { where: { usu_email:  email } } ).subscribe(( res:any )=>{
        res = res.data[0];
        if( !res ) return resolve( false );
        resolve( res );
      },( )=> resolve("error") );
    });
  }
  async createUser( data:any ){
    return new Promise ( resolve => {
      let querys:any = {
        usu_clave: data.email,
        usu_confir: data.email,
        usu_usuario: data.firstName + data.lastName,
        usu_email: data.email,
        usu_nombre: data.name,
        usu_documento: data.id,
        usu_imagen: data.photoUrl
      };
      this.create( querys ).subscribe( ( res:any )=>{
        if(res.success){
          this.dataStore( res.data );
          resolve( res );
        }else resolve( false );
      },( )=> resolve('error') )
    })
  }

  dataStore( data:any ){
    localStorage.setItem('user', JSON.stringify( data ));
    let accion = new UserAction( data, 'post');
    this._store.dispatch(accion);
  }

}
