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
    this._tools.confirm({
      title: `¿Eliminar el modulo "${modulo.title}"?`,
      detalle: `Esto tambien borra sus ${modulo.lessons.length} lecciones (con sus videos) sin poder deshacerlo.`,
      confir: 'Si, eliminar',
    }).then((res: any) => {
      if (!res.isConfirmed) return;
      this._acelerador.deleteModule(modulo.id).subscribe(() => {
        this._tools.tooast({ title: 'Eliminado' });
        this.cargarTodo();
      });
    });
  }

  // Reordenar modulos: intercambia sort_order con el vecino y guarda ambos. Simple (sin
  // drag&drop) pero suficiente para acomodar el orden real del curso desde cero o corregirlo.
  moverModulo(index: number, direccion: number) {
    const vecino = index + direccion;
    if (vecino < 0 || vecino >= this.listModules.length) return;
    const actual = this.listModules[index];
    const otro = this.listModules[vecino];
    const ordenActual = actual.sort_order;
    actual.sort_order = otro.sort_order;
    otro.sort_order = ordenActual;
    this._acelerador.updateModule(actual).subscribe(() => {
      this._acelerador.updateModule(otro).subscribe(() => this.cargarTodo());
    });
  }

  moverLeccion(modulo: any, index: number, direccion: number) {
    const vecino = index + direccion;
    if (vecino < 0 || vecino >= modulo.lessons.length) return;
    const actual = modulo.lessons[index];
    const otro = modulo.lessons[vecino];
    const ordenActual = actual.sort_order;
    actual.sort_order = otro.sort_order;
    otro.sort_order = ordenActual;
    this._acelerador.updateLesson(actual).subscribe(() => {
      this._acelerador.updateLesson(otro).subscribe(() => this.cargarTodo());
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
    this._tools.confirm({
      title: `¿Eliminar la leccion "${leccion.title}"?`,
      detalle: 'Esto tambien borra el video subido, sin poder deshacerlo.',
      confir: 'Si, eliminar',
    }).then((res: any) => {
      if (!res.isConfirmed) return;
      this._acelerador.deleteLesson(leccion.id).subscribe(() => {
        this._tools.tooast({ title: 'Eliminado' });
        this.cargarTodo();
      });
    });
  }
}
