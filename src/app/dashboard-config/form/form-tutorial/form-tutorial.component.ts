import { Component, OnInit, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';
import { CursosService } from 'src/app/servicesComponents/cursos.service';
import { ToolsService } from 'src/app/services/tools.service';
import * as _ from 'lodash';

// Crear/editar un video tutorial dentro de una categoria. El link de YouTube se guarda ya
// normalizado (solo el ID) usando el mismo extractor que el curso Acelerador de Ventas -- acepta
// pegar el link completo en cualquier formato (watch?v=, youtu.be/, shorts/, etc.) o el ID solo.
@Component({
  selector: 'app-form-tutorial',
  templateUrl: './form-tutorial.component.html',
  styleUrls: ['./form-tutorial.component.scss']
})
export class FormTutorialComponent implements OnInit {

  data: any = {};
  id: any;
  titulo = 'Crear';

  constructor(
    private _cursos: CursosService,
    public _tools: ToolsService,
    public dialogRef: MatDialogRef<FormTutorialComponent>,
    @Inject(MAT_DIALOG_DATA) public datas: any,
  ) { }

  ngOnInit() {
    if (this.datas.datos && Object.keys(this.datas.datos).length > 0) {
      this.data = _.clone(this.datas.datos);
      this.id = this.data.id;
      this.titulo = 'Actualizar';
    } else {
      this.data = { padre: this.datas.categoriaId, orden: this.datas.orden || 0 };
      this.id = null;
    }
  }

  submit() {
    if (!this.data.titulo || !this.data.url) {
      this._tools.tooast({ title: 'Completa el titulo y el link de YouTube', icon: 'error' });
      return;
    }
    this.data.url = this._tools.extraerIdYoutube(this.data.url);
    if (this.id) {
      this._cursos.update(this.data).subscribe(() => {
        this._tools.tooast({ title: 'Actualizado' });
        this.dialogRef.close(true);
      }, () => this._tools.tooast({ title: 'Error de servidor', icon: 'error' }));
    } else {
      this._cursos.create(this.data).subscribe(() => {
        this._tools.tooast({ title: 'Creado' });
        this.dialogRef.close(true);
      }, () => this._tools.tooast({ title: 'Error de servidor', icon: 'error' }));
    }
  }
}
