import { Injectable } from '@angular/core';
import { ServiciosService } from '../services/servicios.service';
import { UserAction } from '../redux/app.actions';
import { STORAGES } from '../interfaces/sotarage';
import { Store } from '@ngrx/store';
import { supabase } from '../services/supabase.client';
import { from, of } from 'rxjs';

// Convierte una fila de `profiles` (+ join de roles) al formato viejo de Tblusuario
// para que los componentes existentes (usu_nombre, usu_perfil.prf_descripcion, etc.) no cambien.
function mapProfileToLegacyUser(profile: any, email: string, token?: string) {
  return {
    id: profile.id,
    usu_nombre: profile.full_name,
    usu_apellido: profile.last_name,
    usu_email: email,
    usu_telefono: profile.phone,
    usu_documento: profile.document_id,
    usu_usuario: profile.referral_code,
    usu_imagen: profile.avatar_url,
    codigo: profile.referral_code,
    cabeza: profile.referrer_id,
    usu_perfil: { prf_descripcion: profile.roles ? profile.roles.name : 'vendedor' },
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

  getOn(query:any){
    return this._model.querys('tblusuario/querysOn',query, 'post');
  }

  getStore(query:any){
    return this._model.querys('tblusuario/querysStore',query, 'post');
  }

  getStores(query:any){
    return this._model.querys('tblusuario/queryStores',query, 'post');
  }

  recuperacion(query:any){
    return this._model.querys('tblusuario/resetiar',query, 'post');
  }

  getInfo(query:any){
    return this._model.querys('tblusuario/infoUser',query, 'post');
  }

  darPuntos(query:any){
    return this._model.querys('tblusuario/guardarPunto',query, 'post');
  }

  getNivel(query:any){
    return this._model.querys('tblusuario/nivelUser',query, 'post');
  }

  cambioPass(query:any){
    return this._model.querys('tblusuario/cambioPass',query, 'post');
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

  update(query:any){
    return this._model.querys('tblusuario/'+query.id, query, 'put');
  }

  updatePlatform(query:any){
    return this._model.querys('tblusuario/updatePlatform', query, 'post');
  }

  delete(query:any){
    return this._model.querys('tblusuario/'+query.id, query, 'delete');
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
  getRecaudo(query:any){
    return this._model.querys('platadistribuidor/querys',query, 'post');
  }
  getPerfiles(query:any){
    return this._model.querys('tblcategoriaperfil/querys',query, 'post');
  }
  olvidoPass(query:any){
    return this._model.querys('tblusuario/olvidopass',query, 'post');
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
