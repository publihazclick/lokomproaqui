import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { RegistroComponent } from 'src/app/components/registro/registro.component';
import { OpenIframeComponent } from 'src/app/extra/open-iframe/open-iframe.component';
import { STORAGES } from 'src/app/interfaces/sotarage';
import { ToolsService } from 'src/app/services/tools.service';

@Component({
  selector: 'app-info',
  templateUrl: './info.component.html',
  styleUrls: ['./info.component.scss']
})
export class InfoComponent implements OnInit {
  numberInf:number = 0;
  // Anuncio del curso "Acelerador de Ventas" en la vitrina principal (reutiliza el mismo video
  // gancho 1 que ya se usa en /acelerador -- no un video nuevo, sino el mismo anuncio en 2 lugares).
  // Se muestra primero la miniatura propia (sin el "chrome" de YouTube: nombre de canal, logo,
  // titulo) con un boton de play a medida; el iframe real (con autoplay) solo se carga al hacer
  // click, para que la tarjeta se sienta como un anuncio diseñado y no como un video incrustado.
  aceleradorVideoId: string = null;
  cursoAdThumbnail: string = null;
  cursoAdReproduciendo = false;
  videoGanchoCurso: any = null;

  constructor(
    public dialog: MatDialog,
    private _store: Store<STORAGES>,
    private _router: Router,
    private _tools: ToolsService,
  ) {
    this._store.subscribe((store: any) => {
      store = store.name;
      if(!store) return false;
      try {
        this.numberInf = store.configuracion.clInformacion
      } catch (error) {
        this.numberInf = 3213692393;
      }
      const config = store.configuracion || {};
      this.aceleradorVideoId = config.aceleradorVideoGancho1
        ? this._tools.extraerIdYoutube(config.aceleradorVideoGancho1)
        : null;
      this.cursoAdThumbnail = this.aceleradorVideoId
        ? `https://img.youtube.com/vi/${this.aceleradorVideoId}/hqdefault.jpg`
        : null;
    });
  }

  reproducirCursoAd(){
    if(!this.aceleradorVideoId) return;
    this.cursoAdReproduciendo = true;
    this.videoGanchoCurso = this._tools.seguridadIfrane(
      `https://www.youtube-nocookie.com/embed/${this.aceleradorVideoId}?autoplay=1`
    );
  }

  ngOnInit(): void {
  }

  handleOpenView( url:string ){
    const dialogRef = this.dialog.open(OpenIframeComponent, {
      width: '50%',
      data: {
        url: url
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      console.log(`Dialog result: ${result}`);
    });
  }

  handleOpenCheckIn( opt:string ){
    //this._router.navigate(['/registro']);
    this._router.navigate(['/singUp', opt, ( this.numberInf || '3213692393' ) ])
    /*const dialogRef = this.dialog.open(RegistroComponent, {
      width: '100%',
      data: {
        view: opt,
        title: opt === "proveedor" ? "Registrate y muestra tus productos a cientos de vendedores": "Crea tu tienda virtual y compartela",
        cabeza: 1,
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      console.log(`Dialog result: ${result}`);
    });*/
  }

  handleInfo(){
    let url = `https://wa.me/57${ this.numberInf }?text=Hola Servicio al cliente`
    window.open( url )
  }

  irAlAcelerador(){
    this._router.navigate(['/acelerador']);
  }

}
