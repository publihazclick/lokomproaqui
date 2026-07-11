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
      this.data = { module_id: this.datas.moduleId, sort_order: 0 };
      this.id = null;
    }
  }

  onSelectVideo(event: any) {
    this.videoFiles = [event.addedFiles[0]];
  }
  onRemoveVideo() {
    this.videoFiles = [];
  }

  onSelectThumbnail(event: any) {
    this.thumbnailFiles = [event.addedFiles[0]];
  }
  onRemoveThumbnail() {
    this.thumbnailFiles = [];
  }

  subirVideo() {
    if (!this.videoFiles.length) return;
    this.subiendoVideo = true;
    const form: any = new FormData();
    form.append('file', this.videoFiles[0]);
    this._archivos.createPrivateVideo(form).subscribe((res: any) => {
      this.subiendoVideo = false;
      if (!res.success) { this._tools.tooast({ title: 'Error subiendo el video', icon: 'error' }); return; }
      this.data.video_path = res.path;
      this._tools.tooast({ title: 'Video subido' });
    }, () => { this.subiendoVideo = false; this._tools.tooast({ title: 'Error subiendo el video', icon: 'error' }); });
  }

  subirThumbnail() {
    if (!this.thumbnailFiles.length) return;
    this.subiendoThumbnail = true;
    const form: any = new FormData();
    form.append('file', this.thumbnailFiles[0]);
    this._archivos.create(form).subscribe((res: any) => {
      this.subiendoThumbnail = false;
      if (!res.success) { this._tools.tooast({ title: 'Error subiendo la miniatura', icon: 'error' }); return; }
      this.data.thumbnail_url = res.files;
      this._tools.tooast({ title: 'Miniatura subida' });
    }, () => { this.subiendoThumbnail = false; this._tools.tooast({ title: 'Error subiendo la miniatura', icon: 'error' }); });
  }

  submit() {
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
