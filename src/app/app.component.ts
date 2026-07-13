import { Component } from '@angular/core';
import { MatDialog } from '@angular/material';
import { SwUpdate } from '@angular/service-worker';
import { AlertaGanadorComponent } from './extra/alerta-ganador/alerta-ganador.component';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'locomproAqui';
  constructor(
    public dialog: MatDialog,
    private swUpdate: SwUpdate,
    private _auth: AuthService,
  ){
    //this.abrirVenta();
    this.checkForUpdates();
    // store.configuracion (banners, precios, videos gancho, etc.) antes solo se cargaba al
    // entrar a /config/* (rutas protegidas por AuthService como guard) -- un visitante anonimo
    // que aterrizaba directo en /info o /acelerador nunca disparaba esa carga, asi que bloques
    // como el precio-banner o el anuncio del curso quedaban vacios para el visitante real (solo
    // se veian en el navegador del admin, porque ya tenia configuracion cacheada en localStorage
    // de haber entrado antes al panel). Se carga una vez aca, para toda la app.
    this._auth.validandoConfig();
  }

  // Sin esto, el Service Worker deja a los usuarios con la version anterior de la app
  // cacheada indefinidamente hasta que el navegador decida revisar por su cuenta (puede
  // tardar minutos u horas). Con esto, apenas hay un deploy nuevo la app se recarga sola.
  checkForUpdates(){
    if( !this.swUpdate.isEnabled ) return;
    this.swUpdate.available.subscribe(()=>{
      this.swUpdate.activateUpdate().then(()=> document.location.reload());
    });
    this.swUpdate.checkForUpdate();
  }

  abrirVenta(){
    const dialogRef = this.dialog.open( AlertaGanadorComponent,{
      data: {datos: {}},
      // height:  '550px',
      width: '100%',
    });

    dialogRef.afterClosed().subscribe(result => {
      console.log(`Dialog result: ${result}`);
    });
  }
}
