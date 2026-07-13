import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { STORAGES } from 'src/app/interfaces/sotarage';
import { AceleradorService } from 'src/app/servicesComponents/acelerador.service';

// Reproductor protegido: el video nunca llega con una URL publica, se pide una firmada de corta
// duracion (ver acelerador-signed-url) SOLO si la suscripcion esta vigente. La marca de agua y el
// bloqueo de clic derecho de aca abajo son disuasivos, no proteccion real -- ninguna medida de
// software impide grabar la pantalla, esto solo deja rastro de que cuenta genero el video.
//
// Estructura tipo curso: sidebar con todos los modulos/lecciones (para ubicarse y saltar a
// cualquier leccion) + Siguiente/Anterior para avanzar en orden sin volver al sidebar. El id de
// la leccion se lee de forma reactiva (this._route.params, no solo snapshot) porque Angular
// reutiliza esta misma instancia de componente al navegar entre lecciones de la misma ruta.
@Component({
  selector: 'app-acelerador-player',
  templateUrl: './acelerador-player.component.html',
  styleUrls: ['./acelerador-player.component.scss']
})
export class AceleradorPlayerComponent implements OnInit, OnDestroy {

  dataUser: any = {};
  videoUrl: string = null;
  cargando = true;
  cargandoContenido = true;
  error: string = null;
  marcaAguaTop = 10;
  marcaAguaLeft = 10;
  private jitterInterval: any = null;

  listModules: any[] = [];
  leccionActualId: number = null;
  leccionActual: any = null;
  moduloActual: any = null;
  leccionAnterior: any = null;
  leccionSiguiente: any = null;
  sidebarAbierto = false;

  constructor(
    private _route: ActivatedRoute,
    private _router: Router,
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
    this._acelerador.getModulesWithLessons().subscribe((res: any) => {
      this.listModules = res.data || [];
      this.cargandoContenido = false;
      this.ubicarLeccionActual();
    });

    this._route.params.subscribe(params => {
      const lessonId = Number(params['id']);
      this.leccionActualId = lessonId;
      this.cargarVideo(lessonId);
      this.ubicarLeccionActual();
    });

    this.jitterInterval = setInterval(() => this.moverMarcaAgua(), 25000);
  }

  ngOnDestroy(): void {
    if (this.jitterInterval) clearInterval(this.jitterInterval);
  }

  // Aplana modulos->lecciones en el orden real del curso para saber cual es la leccion
  // anterior/siguiente, y ubica el titulo/descripcion/modulo de la leccion actual para mostrarlos.
  private ubicarLeccionActual() {
    if (!this.listModules.length || !this.leccionActualId) return;
    const plano: any[] = [];
    for (const modulo of this.listModules) {
      for (const leccion of (modulo.lessons || [])) {
        plano.push({ ...leccion, moduloTitle: modulo.title });
      }
    }
    const idx = plano.findIndex(l => l.id === this.leccionActualId);
    this.leccionActual = idx >= 0 ? plano[idx] : null;
    this.moduloActual = this.leccionActual ? this.leccionActual.moduloTitle : null;
    this.leccionAnterior = idx > 0 ? plano[idx - 1] : null;
    this.leccionSiguiente = idx >= 0 && idx < plano.length - 1 ? plano[idx + 1] : null;
  }

  irALeccion(id: number) {
    this.sidebarAbierto = false;
    this._router.navigate(['/acelerador/leccion', id]);
  }

  toggleSidebar() {
    this.sidebarAbierto = !this.sidebarAbierto;
  }

  formatDuracion(segundos: number): string {
    if (!segundos && segundos !== 0) return '';
    const m = Math.floor(segundos / 60);
    const s = Math.round(segundos % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  cargarVideo(lessonId: number) {
    this.cargando = true;
    this.error = null;
    this.videoUrl = null;
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
