import { Component, OnInit } from '@angular/core';
import { CursosService } from 'src/app/servicesComponents/cursos.service';
import { ToolsService } from 'src/app/services/tools.service';

// Pagina publica de tutoriales en YouTube que enseñan a usar LokomproAqui. El contenido lo
// organiza el administrador desde /config/cursos (CursosComponent): categorias (courses con
// parent_id null) + videos (parent_id = id de la categoria). Aqui solo se lee y se muestra.
@Component({
  selector: 'app-tutoriales',
  templateUrl: './tutoriales.component.html',
  styleUrls: ['./tutoriales.component.scss']
})
export class TutorialesComponent implements OnInit {

  loader = true;
  listCategorias: any[] = [];
  categoriaActivaId: any = null;

  // Lista aplanada de TODOS los videos en el orden que se muestran, para poder navegar
  // Siguiente/Anterior dentro del lightbox sin importar de que categoria viene cada uno.
  private videosPlanos: any[] = [];

  videoAbierto: any = null;
  videoAbiertoUrl: any = null;
  hayAnterior = false;
  haySiguiente = false;

  constructor(
    private _cursos: CursosService,
    public _tools: ToolsService,
  ) { }

  ngOnInit(): void {
    this.loader = true;
    this._cursos.get({}).subscribe((res: any) => {
      const todos = res.data || [];
      const categorias = todos.filter((c: any) => !c.padre);
      this.listCategorias = categorias.map((cat: any) => ({
        ...cat,
        videos: todos.filter((v: any) => v.padre === cat.id),
      })).filter((cat: any) => cat.videos.length > 0);

      this.videosPlanos = [];
      for (const cat of this.listCategorias) {
        for (const video of cat.videos) {
          this.videosPlanos.push(video);
        }
      }

      if (this.listCategorias.length > 0) {
        this.categoriaActivaId = this.listCategorias[0].id;
      }
      this.loader = false;
    });
  }

  get categoriaActiva() {
    return this.listCategorias.find(c => c.id === this.categoriaActivaId);
  }

  seleccionarCategoria(id: any) {
    this.categoriaActivaId = id;
  }

  thumbnail(video: any): string {
    return `https://img.youtube.com/vi/${video.url}/hqdefault.jpg`;
  }

  abrirVideo(video: any) {
    this.videoAbierto = video;
    this.videoAbiertoUrl = this._tools.seguridadIfrane(
      `https://www.youtube.com/embed/${video.url}?autoplay=1&rel=0`
    );
    this.actualizarNavegacion();
  }

  cerrarVideo() {
    this.videoAbierto = null;
    this.videoAbiertoUrl = null;
  }

  private actualizarNavegacion() {
    const idx = this.videosPlanos.findIndex(v => v.id === this.videoAbierto.id);
    this.hayAnterior = idx > 0;
    this.haySiguiente = idx >= 0 && idx < this.videosPlanos.length - 1;
  }

  videoAnterior() {
    const idx = this.videosPlanos.findIndex(v => v.id === this.videoAbierto.id);
    if (idx > 0) this.abrirVideo(this.videosPlanos[idx - 1]);
  }

  videoSiguiente() {
    const idx = this.videosPlanos.findIndex(v => v.id === this.videoAbierto.id);
    if (idx >= 0 && idx < this.videosPlanos.length - 1) this.abrirVideo(this.videosPlanos[idx + 1]);
  }
}
