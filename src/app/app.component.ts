import { Component } from '@angular/core';
import { MatDialog } from '@angular/material';
import { SwUpdate } from '@angular/service-worker';
import { AlertaGanadorComponent } from './extra/alerta-ganador/alerta-ganador.component';

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
  ){
    //this.abrirVenta();
    this.checkForUpdates();
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
