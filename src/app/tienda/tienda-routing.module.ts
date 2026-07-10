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
    ]
  },
  {
    path: 'config',
    children: [{
      path: '',
      loadChildren: () => import('./../dashboard-config/config.module').then(m => m.ConfigModule)
    }]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TiendaRoutingModule { }
