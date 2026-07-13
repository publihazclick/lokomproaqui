import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from './auth.service';

// Unico guard que deja entrar al panel del rol "mentor" (subir/organizar el contenido del curso
// Acelerador de Ventas). Sin sesion o con cualquier otro rol, se manda a la ruta de registro
// secreta -- este panel no aparece en ningun menu, solo se llega sabiendo la URL.
@Injectable({
  providedIn: 'root'
})
export class MentorGuard implements CanActivate {
  constructor(private _auth: AuthService, private router: Router) {}

  canActivate(): boolean {
    if (!this._auth.isLoggedIn()) {
      this.router.navigate(['/mvid8x2qz1']);
      return false;
    }
    const perfil = this._auth.dataUser.usu_perfil;
    if (!perfil || perfil.prf_descripcion !== 'mentor') {
      this.router.navigate(['/info']);
      return false;
    }
    return true;
  }
}
