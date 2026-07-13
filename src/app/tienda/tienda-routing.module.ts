import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { PedidosComponent } from '../components/pedidos/pedidos.component';
import { ProductoViewComponent } from '../components/producto-view/producto-view.component';
import { TestimoniosComponent } from '../components/testimonios/testimonios.component';
import { LoginsComponent } from '../layout/login/login.component';
import { RegistrosComponent } from '../layout/registro/registro.component';
import { TiendaComponent } from './tienda.component';
import { ArticuloComponent } from '../components/articulo/articulo.component';
import { InfoComponent } from '../layout/info/info.component';
import { InfoSupplierComponent } from '../layout/info-supplier/info-supplier.component';
import { PortalComponent } from '../layout/portal/portal.component';
import { SignUpComponent } from '../layout/sign-up/sign-up.component';
import { ListArticleComponent } from '../components/list-article/list-article.component';
import { GuestGuard } from '../services/guest.guard';
import { AceleradorGuard } from '../services/acelerador.guard';
import { AceleradorComponent } from '../components/acelerador/acelerador.component';
import { AceleradorPlayerComponent } from '../components/acelerador-player/acelerador-player.component';
import { MentorRegistroComponent } from '../components/mentor-registro/mentor-registro.component';
import { MentorPanelComponent } from '../components/mentor-panel/mentor-panel.component';
import { MentorGuard } from '../services/mentor.guard';

const routes: Routes = [
  {
    path: '',
    component: TiendaComponent,
    children: [
      { path: '', redirectTo: '/info', pathMatch: 'full' },
      { path: 'realizarventa', component: ArticuloComponent, canActivate: [GuestGuard] },
      { path: 'realizarventa/:categoria', component: ArticuloComponent, canActivate: [GuestGuard] },
      { path: 'pedidos', component: ArticuloComponent, canActivate: [GuestGuard] },
      { path: 'pedidos/:categoria', component: ArticuloComponent, canActivate: [GuestGuard] },
      { path: 'articulo', component: PedidosComponent, canActivate: [GuestGuard] },
      //{ path: ':id', component: ArticuloComponent },
      { path: 'productos/:id', component: ProductoViewComponent, canActivate: [GuestGuard] },
      { path: 'testimonio', component: TestimoniosComponent, canActivate: [GuestGuard] },
      { path: 'login', component: LoginsComponent },
      { path: 'login/:id/:cel', component: LoginsComponent },
      { path: 'qz7f3f0888', component: LoginsComponent },
      { path: 'registro', component: RegistrosComponent },
      { path: 'singUp', component: SignUpComponent },
      { path: 'singUp/:type/:cel', component: SignUpComponent },
      { path: 'registro/:id', component: RegistrosComponent },
      { path: 'info', component: InfoComponent },
      { path: 'infoSupplier', component: InfoSupplierComponent },
      { path: 'portal', component: PortalComponent },
      {path: 'listproduct/:idStore', component: ListArticleComponent, canActivate: [GuestGuard] },
      {path: 'listproduct/categoria/:idCategoria', component: ListArticleComponent, canActivate: [GuestGuard] },
      {path: 'listproduct', component: ListArticleComponent, canActivate: [GuestGuard] },
      // Publica (la vitrina/login se resuelve adentro segun sesion): no lleva GuestGuard a
      // proposito, un visitante sin loguear debe poder ver la vitrina de venta del curso.
      { path: 'acelerador', component: AceleradorComponent },
      { path: 'acelerador/leccion/:id', component: AceleradorPlayerComponent, canActivate: [AceleradorGuard] },
    ]
  },
  {
    path: 'config',
    children: [{
      path: '',
      loadChildren: () => import('./../dashboard-config/config.module').then(m => m.ConfigModule)
    }]
  },
  // Ruta secreta del rol "mentor" (subir/organizar el contenido del curso Acelerador de Ventas):
  // a proposito NO esta anidada bajo TiendaComponent (sin el header/menu del marketplace) ni
  // enlazada desde ningun menu -- solo se llega sabiendo la URL.
  { path: 'mvid8x2qz1', component: MentorRegistroComponent },
  { path: 'mvid8x2qz1/panel', component: MentorPanelComponent, canActivate: [MentorGuard] },
  // Comodin real (2026-07-10): cualquier URL que no matchee NINGUNA ruta de arriba (mal escrita,
  // vieja, borrada) cae aca en vez de pantalla en blanco. Va DESPUES de 'config' a proposito: el
  // primer bloque (path:'') no tiene pathMatch:'full', asi que consume 0 segmentos y prueba sus
  // hijos contra la URL completa restante — si un comodin viviera ADENTRO de esos hijos,
  // interceptaria tambien /config/** antes de que Angular llegue siquiera a probar la ruta
  // 'config' de aqui abajo, rompiendo todo el panel admin. Como entrada de nivel raiz aparte, solo
  // se prueba cuando ni el arbol de TiendaComponent ni 'config' matchearon nada.
  { path: '**', redirectTo: '/info' },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TiendaRoutingModule { }
