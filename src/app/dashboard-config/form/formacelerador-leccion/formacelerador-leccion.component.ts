import { Component, OnInit, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';
import { AceleradorService } from 'src/app/servicesComponents/acelerador.service';
import { ArchivosService } from 'src/app/servicesComponents/archivos.service';
import { ToolsService } from 'src/app/services/tools.service';
import * as _ from 'lodash';

@Component({
  selector: 'app-formacelerador-leccion',
  templateUrl: './formacelerador-leccion.component.html',
  styleUrls: ['./formacelerador-leccion.component.scss']
})
export class FormaceleradorLeccionComponent implements OnInit {

  data: any = {};
  id: any;
  titulo = 'Crear';
  listModules: any[] = [];

  videoFiles: File[] = [];
  thumbnailFiles: File[] = [];
  subiendoVideo = false;
  subiendoThumbnail = false;
  progresoVideo = 0;
  videoError: string = null;
  // Limite real del proyecto (Storage global de Supabase, subido de 50 a 500MB para que un
  // video de leccion real -- varios minutos, 720p -- entre sin que el mentor tenga que
  // comprimir nada primero). Se avisa ANTES de intentar subir, para no hacerlo esperar un
  // video que va a fallar seguro igual.
  readonly LIMITE_MB = 500;

  constructor(
    private _acelerador: AceleradorService,
    private _archivos: ArchivosService,
    private _tools: ToolsService,
    public dialogRef: MatDialogRef<FormaceleradorLeccionComponent>,
    @Inject(MAT_DIALOG_DATA) public datas: any,
  ) { }

  ngOnInit() {
    this.listModules = this.datas.listModules || [];
    if (this.datas.datos && Object.keys(this.datas.datos).length > 0) {
      this.data = _.clone(this.datas.datos);
      this.id = this.data.id;
      this.titulo = 'Actualizar';
    } else {
      // El orden se calcula solo (va al final de la lista) -- reordenar ya se hace con las
      // flechas del panel, no tiene sentido pedirle al mentor que adivine un numero aca.
      const modulo = this.listModules.find(m => m.id === this.datas.moduleId);
      const siguienteOrden = modulo && modulo.lessons ? modulo.lessons.length : 0;
      this.data = { module_id: this.datas.moduleId, sort_order: siguienteOrden };
      this.id = null;
    }
  }

  // Apenas el mentor elige/suelta el video arranca la subida sola, con barra de progreso --
  // no hace falta un segundo click en "Subir".
  onSelectVideo(event: any) {
    const file: File = event.addedFiles[0];
    if (!file) return;
    this.videoFiles = [file];
    this.videoError = null;
    this.data.video_path = null;
    this.detectarDuracion(file);

    const pesoMb = file.size / (1024 * 1024);
    if (pesoMb > this.LIMITE_MB) {
      this.videoError = `Pesa ${pesoMb.toFixed(0)} MB y el limite es ${this.LIMITE_MB} MB. Comprimilo (ej. con HandBrake) o grabalo en menor calidad e intenta de nuevo.`;
      this._tools.basicIcons({ header: 'Este video pesa demasiado', subheader: this.videoError, icon: 'warning' });
      return;
    }
    this.subirVideo();
  }
  onRemoveVideo() {
    this.videoFiles = [];
    this.data.video_path = null;
    this.videoError = null;
  }

  // Lee la duracion real del archivo (sin subirlo) para no depender de que el mentor la calcule
  // a mano -- se muestra editable igual, por si el video tiene metadata rara.
  private detectarDuracion(file: File) {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      if (isFinite(video.duration)) this.data.duration_seconds = Math.round(video.duration);
      URL.revokeObjectURL(url);
    };
    video.src = url;
  }

  onSelectThumbnail(event: any) {
    this.thumbnailFiles = [event.addedFiles[0]];
    this.subirThumbnail();
  }
  onRemoveThumbnail() {
    this.thumbnailFiles = [];
    this.data.thumbnail_url = null;
  }

  private subirVideo() {
    if (!this.videoFiles.length) return;
    this.subiendoVideo = true;
    this.progresoVideo = 0;
    // El observable emite progreso repetidas veces ({progress}) antes de emitir el resultado
    // final ({success, path} o {success:false, message}) y completarse -- solo ese ultimo
    // emitido trae "success", los intermedios no.
    this._archivos.createPrivateVideoConProgreso(this.videoFiles[0]).subscribe((res: any) => {
      this.progresoVideo = res.progress;
      if (res.success === undefined) return;
      this.subiendoVideo = false;
      if (!res.success) {
        this.videoError = res.message || 'Error subiendo el video. Intenta de nuevo.';
        this._tools.basicIcons({ header: 'Error subiendo el video', subheader: this.videoError, icon: 'error' });
        return;
      }
      this.data.video_path = res.path;
      this._tools.tooast({ title: 'Video subido' });
    }, () => {
      this.subiendoVideo = false;
      this.videoError = 'Error subiendo el video. Intenta de nuevo.';
      this._tools.basicIcons({ header: 'Error subiendo el video', subheader: this.videoError, icon: 'error' });
    });
  }

  // Reintentar sin obligar al mentor a volver a elegir el archivo desde el explorador --
  // solo tiene sentido para fallas de conexion/servidor, nunca para el error de "pesa
  // demasiado" (ese archivo va a fallar exactamente igual otra vez).
  reintentarVideo() {
    const file = this.videoFiles[0];
    if (!file || (file.size / (1024 * 1024)) > this.LIMITE_MB) return;
    this.subirVideo();
  }

  get duracionLegible(): string {
    if (!this.data.duration_seconds) return null;
    const min = Math.floor(this.data.duration_seconds / 60);
    const seg = this.data.duration_seconds % 60;
    return `${min}:${seg.toString().padStart(2, '0')}`;
  }

  get puedeReintentar(): boolean {
    const file = this.videoFiles[0];
    return !!file && (file.size / (1024 * 1024)) <= this.LIMITE_MB;
  }

  get puedeGuardar(): boolean {
    return !!(this.data.title && this.data.title.trim() && this.data.video_path && !this.subiendoVideo);
  }

  private subirThumbnail() {
    if (!this.thumbnailFiles.length) return;
    this.subiendoThumbnail = true;
    const form: any = new FormData();
    form.append('file', this.thumbnailFiles[0]);
    this._archivos.create(form).subscribe((res: any) => {
      this.subiendoThumbnail = false;
      if (!res.success) { this._tools.basicIcons({ header: 'Error subiendo la miniatura', subheader: 'Intenta de nuevo', icon: 'error' }); return; }
      this.data.thumbnail_url = res.files;
      this._tools.tooast({ title: 'Miniatura subida' });
    }, () => { this.subiendoThumbnail = false; this._tools.basicIcons({ header: 'Error subiendo la miniatura', subheader: 'Intenta de nuevo', icon: 'error' }); });
  }

  submit() {
    if (!this.data.title || !this.data.title.trim()) {
      this._tools.tooast({ title: 'Ponle un titulo a la leccion', icon: 'error' });
      return;
    }
    if (!this.data.video_path) {
      this._tools.tooast({ title: 'Sube el video antes de guardar', icon: 'error' });
      return;
    }
    if (this.id) {
      this._acelerador.updateLesson(this.data).subscribe(() => {
        this._tools.tooast({ title: 'Actualizado' });
        this.dialogRef.close(true);
      }, () => this._tools.tooast({ title: 'Error de servidor', icon: 'error' }));
    } else {
      this._acelerador.createLesson(this.data).subscribe(() => {
        this._tools.tooast({ title: 'Creado' });
        this.dialogRef.close(true);
      }, () => this._tools.tooast({ title: 'Error de servidor', icon: 'error' }));
    }
  }
}
