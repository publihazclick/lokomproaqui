import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { RegistroComponent } from 'src/app/components/registro/registro.component';
import { OpenIframeComponent } from 'src/app/extra/open-iframe/open-iframe.component';
import { STORAGES } from 'src/app/interfaces/sotarage';
import { ToolsService } from 'src/app/services/tools.service';
import { SeoService } from 'src/app/services/seo.service';

@Component({
  selector: 'app-info',
  templateUrl: './info.component.html',
  styleUrls: ['./info.component.scss']
})
export class InfoComponent implements OnInit {
  numberInf:number = 0;
  // Anuncio del curso "Acelerador de Ventas" en la vitrina principal (reutiliza los mismos 2
  // videos gancho que ya se usan en /acelerador -- no son videos nuevos, es el mismo anuncio en
  // 2 lugares). Se muestra primero la miniatura propia (sin el "chrome" de YouTube: nombre de
  // canal, logo, titulo) con un boton de play a medida; el iframe real (con autoplay) solo se
  // carga al hacer click, para que la tarjeta se sienta como un anuncio diseñado y no como un
  // video incrustado. En escritorio los 2 videos se muestran uno al lado del otro.
  aceleradorVideoId1: string = null;
  aceleradorVideoId2: string = null;
  cursoAdThumbnail1: string = null;
  cursoAdThumbnail2: string = null;
  cursoAdReproduciendo1 = false;
  cursoAdReproduciendo2 = false;
  videoGanchoCurso1: any = null;
  videoGanchoCurso2: any = null;

  constructor(
    public dialog: MatDialog,
    private _store: Store<STORAGES>,
    private _router: Router,
    private _tools: ToolsService,
    private _seo: SeoService,
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
      this.aceleradorVideoId1 = config.aceleradorVideoGancho1
        ? this._tools.extraerIdYoutube(config.aceleradorVideoGancho1)
        : null;
      this.aceleradorVideoId2 = config.aceleradorVideoGancho2
        ? this._tools.extraerIdYoutube(config.aceleradorVideoGancho2)
        : null;
      this.cursoAdThumbnail1 = this.aceleradorVideoId1
        ? `https://img.youtube.com/vi/${this.aceleradorVideoId1}/hqdefault.jpg`
        : null;
      this.cursoAdThumbnail2 = this.aceleradorVideoId2
        ? `https://img.youtube.com/vi/${this.aceleradorVideoId2}/hqdefault.jpg`
        : null;
    });
  }

  reproducirCursoAd(video: number){
    const id = video === 2 ? this.aceleradorVideoId2 : this.aceleradorVideoId1;
    if(!id) return;
    const src = this._tools.seguridadIfrane(`https://www.youtube-nocookie.com/embed/${id}?autoplay=1`);
    if(video === 2){
      this.cursoAdReproduciendo2 = true;
      this.videoGanchoCurso2 = src;
    } else {
      this.cursoAdReproduciendo1 = true;
      this.videoGanchoCurso1 = src;
    }
  }

  ngOnInit(): void {
    this._seo.update({
      title: 'LokomproAqui | Dropshipping en Colombia sin Inventario – Vende por Internet',
      description: 'Vende por internet sin invertir en inventario. Elige productos de nuestro catálogo dropshipping, promociónalos y nosotros empacamos y enviamos a tu cliente con pago contra entrega.',
      keywords: 'dropshipping, dropshipping colombia, ventas por internet, vender por internet, negocio por internet, tienda online sin inventario, emprender online',
      path: '/info',
    });
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

}
