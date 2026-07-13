import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { AuthService } from './auth.service';
import { supabase } from './supabase.client';

// A diferencia de GuestGuard (sincrono, confia en el perfil cacheado), este guard hace una
// consulta EN VIVO a acelerador_has_access: la suscripcion puede vencer sin que el usuario haya
// vuelto a loguearse, asi que no basta con confiar en el store/localStorage. Esto es solo UX
// (se salta con devtools, igual que GuestGuard) -- la barrera real es la Edge Function
// acelerador-signed-url, que vuelve a chequear el acceso en el servidor antes de dar el video.
@Injectable({
  providedIn: 'root'
})
export class AceleradorGuard implements CanActivate {
  constructor(private _auth: AuthService, private router: Router) {}

  canActivate(): Observable<boolean> {
    if (!this._auth.isLoggedIn()) {
      this.router.navigate(['/info']);
      return of(false);
    }
    // El mentor sube y organiza el contenido: puede previsualizar cualquier leccion sin
    // necesitar (ni pagar) una suscripcion. La Edge Function acelerador-signed-url tiene
    // el mismo bypass, sin eso el video igual seria rechazado del lado del servidor.
    const perfil = this._auth.dataUser.usu_perfil;
    if (perfil && perfil.prf_descripcion === 'mentor') return of(true);
    return this.checkAccess();
  }

  private checkAccess(): Observable<boolean> {
    const profileId = this._auth.dataUser.id;
    return new Observable<boolean>((subscriber) => {
      supabase.rpc('acelerador_has_access', { p_profile_id: profileId }).then(({ data, error }) => {
        if (error || !data) {
          this.router.navigate(['/acelerador']);
          subscriber.next(false);
        } else {
          subscriber.next(true);
        }
        subscriber.complete();
      });
    });
  }
}
