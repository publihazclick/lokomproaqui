import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material';
import { CursosService } from 'src/app/servicesComponents/cursos.service';
import { ToolsService } from 'src/app/services/tools.service';
import { FormTutorialComponent } from '../../form/form-tutorial/form-tutorial.component';

// Administracion de "Tutoriales" (pagina publica /tutoriales): categorias (courses con
// parent_id null) + videos de YouTube dentro de cada una (parent_id = id de la categoria).
// courses.parent_id NO tiene "on delete cascade" (verificado en la BD), asi que borrar una
// categoria con videos borra primero sus videos a mano, para no romper con un error de FK.
@Component({
  selector: 'app-cursos',
  templateUrl: './cursos.component.html',
  styleUrls: ['./cursos.component.scss']
})
export class CursosComponent implements OnInit {

  listCategorias: any[] = [];
  nuevaCategoriaTitulo = '';
  loader = true;

  constructor(
    private _cursos: CursosService,
    public dialog: MatDialog,
    private _tools: ToolsService,
  ) { }

  ngOnInit(): void {
    this.cargarTodo();
  }

  cargarTodo() {
    this.loader = true;
    this._cursos.get({}).subscribe((res: any) => {
      const todos = res.data || [];
      const categorias = todos.filter((c: any) => !c.padre);
      this.listCategorias = categorias.map((cat: any) => ({
        ...cat,
        videos: todos.filter((v: any) => v.padre === cat.id),
      }));
      this.loader = false;
    });
  }

  crearCategoria() {
    if (!this.nuevaCategoriaTitulo.trim()) return;
    this._cursos.create({ titulo: this.nuevaCategoriaTitulo, orden: this.listCategorias.length, padre: null }).subscribe(() => {
      this.nuevaCategoriaTitulo = '';
      this._tools.tooast({ title: 'Categoria creada' });
      this.cargarTodo();
    }, () => this._tools.tooast({ title: 'Error de servidor', icon: 'error' }));
  }

  actualizarCategoria(cat: any) {
    this._cursos.update(cat).subscribe(() => this._tools.tooast({ title: 'Actualizado' }));
  }

  eliminarCategoria(cat: any) {
    this._tools.confirm({
      title: `¿Eliminar la categoria "${cat.titulo}"?`,
      detalle: `Esto tambien borra sus ${cat.videos.length} videos, sin poder deshacerlo.`,
      confir: 'Si, eliminar',
    }).then(async (res: any) => {
      if (!res.isConfirmed) return;
      for (const video of cat.videos) {
        await this._cursos.delete({ id: video.id }).toPromise();
      }
      this._cursos.delete({ id: cat.id }).subscribe(() => {
        this._tools.tooast({ title: 'Eliminado' });
        this.cargarTodo();
      });
    });
  }

  moverCategoria(index: number, direccion: number) {
    const vecino = index + direccion;
    if (vecino < 0 || vecino >= this.listCategorias.length) return;
    const actual = this.listCategorias[index];
    const otro = this.listCategorias[vecino];
    const ordenActual = actual.orden;
    actual.orden = otro.orden;
    otro.orden = ordenActual;
    this._cursos.update(actual).subscribe(() => {
      this._cursos.update(otro).subscribe(() => this.cargarTodo());
    });
  }

  moverVideo(cat: any, index: number, direccion: number) {
    const vecino = index + direccion;
    if (vecino < 0 || vecino >= cat.videos.length) return;
    const actual = cat.videos[index];
    const otro = cat.videos[vecino];
    const ordenActual = actual.orden;
    actual.orden = otro.orden;
    otro.orden = ordenActual;
    this._cursos.update(actual).subscribe(() => {
      this._cursos.update(otro).subscribe(() => this.cargarTodo());
    });
  }

  crearVideo(cat: any) {
    const dialogRef = this.dialog.open(FormTutorialComponent, {
      width: '600px',
      data: { datos: {}, categoriaId: cat.id, orden: cat.videos.length },
    });
    dialogRef.afterClosed().subscribe(() => this.cargarTodo());
  }

  editarVideo(video: any) {
    const dialogRef = this.dialog.open(FormTutorialComponent, {
      width: '600px',
      data: { datos: video },
    });
    dialogRef.afterClosed().subscribe(() => this.cargarTodo());
  }

  eliminarVideo(video: any) {
    this._tools.confirm({
      title: `¿Eliminar el video "${video.titulo}"?`,
      confir: 'Si, eliminar',
    }).then((res: any) => {
      if (!res.isConfirmed) return;
      this._cursos.delete({ id: video.id }).subscribe(() => {
        this._tools.tooast({ title: 'Eliminado' });
        this.cargarTodo();
      });
    });
  }
}
