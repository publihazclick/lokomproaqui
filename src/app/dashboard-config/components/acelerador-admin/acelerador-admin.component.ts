import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material';
import { AceleradorService } from 'src/app/servicesComponents/acelerador.service';
import { ToolsService } from 'src/app/services/tools.service';
import { FormaceleradorLeccionComponent } from '../../form/formacelerador-leccion/formacelerador-leccion.component';

@Component({
  selector: 'app-acelerador-admin',
  templateUrl: './acelerador-admin.component.html',
  styleUrls: ['./acelerador-admin.component.scss']
})
export class AceleradorAdminComponent implements OnInit {

  listModules: any[] = [];
  nuevoModuloTitulo = '';
  loader = true;

  constructor(
    private _acelerador: AceleradorService,
    public dialog: MatDialog,
    private _tools: ToolsService,
  ) { }

  ngOnInit(): void {
    this.cargarTodo();
  }

  cargarTodo() {
    this.loader = true;
    this._acelerador.getModules().subscribe((resMod: any) => {
      this._acelerador.getLessons().subscribe((resLec: any) => {
        this.listModules = (resMod.data || []).map((m: any) => ({
          ...m,
          lessons: (resLec.data || []).filter((l: any) => l.module_id === m.id),
        }));
        this.loader = false;
      });
    });
  }

  crearModulo() {
    if (!this.nuevoModuloTitulo.trim()) return;
    this._acelerador.createModule({ title: this.nuevoModuloTitulo, sort_order: this.listModules.length }).subscribe(() => {
      this.nuevoModuloTitulo = '';
      this._tools.tooast({ title: 'Modulo creado' });
      this.cargarTodo();
    }, () => this._tools.tooast({ title: 'Error de servidor', icon: 'error' }));
  }

  actualizarModulo(modulo: any) {
    this._acelerador.updateModule(modulo).subscribe(() => this._tools.tooast({ title: 'Actualizado' }));
  }

  eliminarModulo(modulo: any) {
    this._acelerador.deleteModule(modulo.id).subscribe(() => {
      this._tools.tooast({ title: 'Eliminado' });
      this.cargarTodo();
    });
  }

  crearLeccion(modulo: any) {
    const dialogRef = this.dialog.open(FormaceleradorLeccionComponent, {
      width: '600px',
      data: { datos: {}, moduleId: modulo.id, listModules: this.listModules },
    });
    dialogRef.afterClosed().subscribe(() => this.cargarTodo());
  }

  editarLeccion(leccion: any) {
    const dialogRef = this.dialog.open(FormaceleradorLeccionComponent, {
      width: '600px',
      data: { datos: leccion, moduleId: leccion.module_id, listModules: this.listModules },
    });
    dialogRef.afterClosed().subscribe(() => this.cargarTodo());
  }

  eliminarLeccion(leccion: any) {
    this._acelerador.deleteLesson(leccion.id).subscribe(() => {
      this._tools.tooast({ title: 'Eliminado' });
      this.cargarTodo();
    });
  }
}
