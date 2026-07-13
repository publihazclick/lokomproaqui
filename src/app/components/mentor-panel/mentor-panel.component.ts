import { Component } from '@angular/core';
import { Store } from '@ngrx/store';
import { STORAGES } from 'src/app/interfaces/sotarage';
import { AuthService } from 'src/app/services/auth.service';

// Panel exclusivo del rol "mentor": solo administrar el contenido del curso Acelerador de
// Ventas (reutiliza AceleradorAdminComponent, el mismo CRUD que ya usaba el panel admin general)
// + poder previsualizar cualquier leccion. No tiene acceso a nada mas de la plataforma.
@Component({
  selector: 'app-mentor-panel',
  templateUrl: './mentor-panel.component.html',
  styleUrls: ['./mentor-panel.component.scss']
})
export class MentorPanelComponent {

  dataUser: any = {};

  constructor(
    private _store: Store<STORAGES>,
    private _auth: AuthService,
  ) {
    this._store.subscribe((store: any) => {
      store = store.name;
      if (!store) return;
      this.dataUser = store.user || {};
    });
  }

  salir() {
    this._auth.deleteStorages();
  }
}
