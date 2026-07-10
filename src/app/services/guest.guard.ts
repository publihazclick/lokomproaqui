import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from './auth.service';

// Cualquier visitante SIN sesion que intente entrar directo a una ruta de tienda (por link
// guardado, historial del navegador, o PWA instalada) se manda primero a /info, la pagina de
// embudo hacia login/registro (2026-07-10, pedido explicito del usuario). No aplica a /front ni
// /publico (links de "compartir mi tienda", que a proposito dejan ver el catalogo sin loguearse).
@Injectable({
  providedIn: 'root'
})
export class GuestGuard implements CanActivate {
  constructor(private _auth: AuthService, private router: Router) {}

  canActivate(): boolean {
    if (this._auth.isLoggedIn()) return true;
    this.router.navigate(['/info']);
    return false;
  }
}
