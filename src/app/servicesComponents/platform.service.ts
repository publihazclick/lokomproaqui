import { Injectable } from '@angular/core';
import { ServiciosService } from '../services/servicios.service';
import { from } from 'rxjs';

// La tabla vieja `Platform` (config de sucursal por transportador) se elimino a proposito en la
// migracion a Supabase: los 4 transportadores viejos fueron reemplazados por Mipaquete (Hito 7),
// que no necesita esa config por-transportador. Se deja como no-op para no romper componentes
// que todavia la llamen.
@Injectable({
  providedIn: 'root'
})
export class PlatformService {

  constructor(
    private _model: ServiciosService
  ) { }

  get(query: any) {
    return from(Promise.resolve({ success: true, data: [] }));
  }
  create(query: any) {
    return from(Promise.resolve({ success: true }));
  }
  update(query: any) {
    return from(Promise.resolve({ success: true }));
  }
  delete(query: any) {
    return from(Promise.resolve({ success: true }));
  }
}
