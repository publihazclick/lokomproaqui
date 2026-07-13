import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { STORAGES } from 'src/app/interfaces/sotarage';
import { UserAction, TokenAction } from 'src/app/redux/app.actions';
import { UsuariosService } from 'src/app/servicesComponents/usuarios.service';
import { ToolsService } from 'src/app/services/tools.service';
import { supabase } from 'src/app/services/supabase.client';

// Ruta secreta (no enlazada en ningun menu) para crear cuentas del rol "mentor" -- unico
// proposito: subir/organizar el contenido del curso Acelerador de Ventas. Reutiliza el mismo
// signUp real de UsuariosService.create() (no un flujo aparte) y despues asigna el rol "mentor"
// directamente, porque el trigger de signup (handle_new_user) siempre usa el rol por defecto
// (vendedor) y no admite asignar un rol distinto por metadata.
@Component({
  selector: 'app-mentor-registro',
  templateUrl: './mentor-registro.component.html',
  styleUrls: ['./mentor-registro.component.scss']
})
export class MentorRegistroComponent {

  data: any = { usu_nombre: '', usu_email: '', usu_telefono: '', usu_clave: '' };
  procesando = false;

  constructor(
    private _usuarios: UsuariosService,
    private _store: Store<STORAGES>,
    private _router: Router,
    private _tools: ToolsService,
  ) { }

  registrar() {
    if (this.procesando) return;
    const d = this.data;
    if (!d.usu_nombre || !d.usu_email || !d.usu_telefono || !d.usu_clave) {
      this._tools.tooast('Completa todos los campos');
      return;
    }
    if (d.usu_clave.length < 6) {
      this._tools.tooast('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    this.procesando = true;
    this._usuarios.create({
      usu_email: d.usu_email.trim(),
      usu_clave: d.usu_clave,
      usu_nombre: d.usu_nombre,
      usu_telefono: d.usu_telefono,
    }).subscribe(async (res: any) => {
      if (!res.success) {
        this.procesando = false;
        this._tools.tooast(res.message || 'No pudimos crear la cuenta, intenta de nuevo');
        return;
      }
      const { data: rol } = await supabase.from('roles').select('id').eq('name', 'mentor').single();
      if (rol) await supabase.from('profiles').update({ role_id: rol.id }).eq('id', res.data.id);

      const userData = { ...res.data, usu_perfil: { prf_descripcion: 'mentor' } };
      this._store.dispatch(new UserAction(userData, 'post'));
      this._store.dispatch(new TokenAction({ token: userData.tokens }, 'post'));
      this.procesando = false;
      this._tools.tooast({ title: 'Cuenta de mentor creada', icon: 'success' });
      this._router.navigate(['/mvid8x2qz1/panel']);
    }, () => {
      this.procesando = false;
      this._tools.tooast('No pudimos crear la cuenta, intenta de nuevo');
    });
  }
}
