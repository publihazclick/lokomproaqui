import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Store } from '@ngrx/store';
import { STORAGES } from 'src/app/interfaces/sotarage';
import { ToolsService } from 'src/app/services/tools.service';
import { AceleradorService } from 'src/app/servicesComponents/acelerador.service';
import { AceleradorCheckoutComponent } from 'src/app/components/acelerador-checkout/acelerador-checkout.component';

@Component({
  selector: 'app-acelerador',
  templateUrl: './acelerador.component.html',
  styleUrls: ['./acelerador.component.scss']
})
export class AceleradorComponent implements OnInit {

  @ViewChild(AceleradorCheckoutComponent) checkout: AceleradorCheckoutComponent;

  dataUser: any = {};
  tieneAcceso = false;
  verificandoAcceso = true;
  listModules: any[] = [];
  videoGancho1: any = null;
  videoGancho2: any = null;

  constructor(
    private _store: Store<STORAGES>,
    private _acelerador: AceleradorService,
    private _route: ActivatedRoute,
    public _tools: ToolsService,
  ) {
    this._store.subscribe((store: any) => {
      store = store.name;
      if (!store) return;
      this.dataUser = store.user || {};
      const config = store.configuracion || {};
      // Videos "gancho" de YouTube no listados: se muestran a CUALQUIERA sin suscripcion activa
      // (incluso sin sesion), a proposito -- son marketing top-of-funnel, no contenido pago. Nada
      // que ver con la protección de las lecciones reales (esas usan el bucket privado + URL firmada).
      this.videoGancho1 = config.aceleradorVideoGancho1
        ? this._tools.seguridadIfrane(`https://www.youtube-nocookie.com/embed/${this._tools.extraerIdYoutube(config.aceleradorVideoGancho1)}`)
        : null;
      this.videoGancho2 = config.aceleradorVideoGancho2
        ? this._tools.seguridadIfrane(`https://www.youtube-nocookie.com/embed/${this._tools.extraerIdYoutube(config.aceleradorVideoGancho2)}`)
        : null;
    });
  }

  ngOnInit(): void {
    this.cargar();
  }

  cargar() {
    this._acelerador.getModulesWithLessons().subscribe((res: any) => {
      this.listModules = res.data || [];
    });

    // ?checkout=1 llega desde el boton "Suscribirme" de la vitrina principal (/info): abre el
    // pago de una vez en vez de solo mostrar la vitrina, para no obligar a un segundo click aca.
    const abrirCheckout = this._route.snapshot.queryParamMap.get('checkout') === '1';

    if (!this.dataUser.id) {
      this.verificandoAcceso = false;
      if (abrirCheckout) setTimeout(() => this.checkout && this.checkout.onClickPrincipal());
      return;
    }

    // El mentor sube y organiza el contenido: tiene que poder ver "Mi Curso" exactamente como lo
    // ve un suscriptor real (no la vitrina de venta), sin necesitar pagar una suscripcion.
    const perfil = this.dataUser.usu_perfil;
    if (perfil && perfil.prf_descripcion === 'mentor') {
      this.tieneAcceso = true;
      this.verificandoAcceso = false;
      return;
    }

    this._acelerador.hasAccess(this.dataUser.id).subscribe((res: any) => {
      this.tieneAcceso = !!res.data;
      this.verificandoAcceso = false;
      if (abrirCheckout && !this.tieneAcceso) setTimeout(() => this.checkout && this.checkout.onClickPrincipal());
    });
  }

  onSuscripcionActivada(){
    this.tieneAcceso = true;
  }

  formatDuracion(segundos: number): string {
    if (!segundos && segundos !== 0) return '';
    const m = Math.floor(segundos / 60);
    const s = Math.round(segundos % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
