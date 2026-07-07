import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { IntroduccionComponent } from './components/introduccion/introduccion.component';
import { ImprimirTarjetaComponent } from './extra/imprimir-tarjeta/imprimir-tarjeta.component';

const routes: Routes = [
  {
    path: 'front',
    children: [{
      path: '',
      loadChildren: () => import('./portada/portada.module').then(m => m.PortadaModule)
    }]
  },
  {
    path: 'front/:cell',
    children: [{
      path: '',
      loadChildren: () => import('./portada/portada.module').then(m => m.PortadaModule)
    }]
  },
  { path: 'publico',
    children: [{
      path: '',
      loadChildren: () => import('./publico/publico.module').then(m => m.PublicoModule)
    }],
    pathMatch: 'full'
  },
  { path: 'publico/:id',
    children: [{
      path: '',
      loadChildren: () => import('./publico/publico.module').then(m => m.PublicoModule)
    }],
    pathMatch: 'full'
  },
  {
    path: "introduccion",
    component: IntroduccionComponent
  },
  {
    path: "imprimirTarjeta",
    component: ImprimirTarjetaComponent
  },
  // Catch-all: cualquier ruta que no sea front/publico/introduccion/imprimirTarjeta
  // se delega a TiendaModule (sin pathMatch:'full' para permitir deep-linking a
  // sus rutas internas, ej. /pedidos, /articulo, /qz7f3f0888, /config/**).
  { path: '',
    children: [{
      path: '',
      loadChildren: () => import('./tienda/tienda.module').then(m => m.TiendaModule)
    }]
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, {
    initialNavigation: 'enabled'
})],
  exports: [RouterModule]
})
export class AppRoutingModule { }
