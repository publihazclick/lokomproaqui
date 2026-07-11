import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Store } from '@ngrx/store';
import { STORAGES } from 'src/app/interfaces/sotarage';
import { AceleradorService } from 'src/app/servicesComponents/acelerador.service';

// Reproductor protegido: el video nunca llega con una URL publica, se pide una firmada de corta
// duracion (ver acelerador-signed-url) SOLO si la suscripcion esta vigente. La marca de agua y el
// bloqueo de clic derecho de aca abajo son disuasivos, no proteccion real -- ninguna medida de
// software impide grabar la pantalla, esto solo deja rastro de que cuenta genero el video.
@Component({
  selector: 'app-acelerador-player',
  templateUrl: './acelerador-player.component.html',
  styleUrls: ['./acelerador-player.component.scss']
})
export class AceleradorPlayerComponent implements OnInit, OnDestroy {

  dataUser: any = {};
  videoUrl: string = null;
  cargando = true;
  error: string = null;
  marcaAguaTop = 10;
  marcaAguaLeft = 10;
  private jitterInterval: any = null;

  constructor(
    private _route: ActivatedRoute,
    private _acelerador: AceleradorService,
    private _store: Store<STORAGES>,
  ) {
    this._store.subscribe((store: any) => {
      store = store.name;
      if (!store) return;
      this.dataUser = store.user || {};
    });
  }

  ngOnInit(): void {
    const lessonId = Number(this._route.snapshot.paramMap.get('id'));
    this.cargarVideo(lessonId);
    this.jitterInterval = setInterval(() => this.moverMarcaAgua(), 25000);
  }

  ngOnDestroy(): void {
    if (this.jitterInterval) clearInterval(this.jitterInterval);
  }

  cargarVideo(lessonId: number) {
    this.cargando = true;
    this.error = null;
    this._acelerador.getSignedUrl(lessonId).subscribe((res: any) => {
      this.cargando = false;
      if (!res.success) {
        this.error = res.message || 'No pudimos cargar el video';
        return;
      }
      this.videoUrl = res.url;
    }, () => {
      this.cargando = false;
      this.error = 'No pudimos cargar el video';
    });
  }

  moverMarcaAgua() {
    this.marcaAguaTop = 10 + Math.random() * 70;
    this.marcaAguaLeft = 10 + Math.random() * 70;
  }

  bloquearMenu(event: Event) {
    event.preventDefault();
    return false;
  }
}
