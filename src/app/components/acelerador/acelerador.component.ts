import { Component, OnInit, OnDestroy } from '@angular/core';
import { Store } from '@ngrx/store';
import { STORAGES } from 'src/app/interfaces/sotarage';
import { ToolsService } from 'src/app/services/tools.service';
import { AceleradorService } from 'src/app/servicesComponents/acelerador.service';
import { environment } from 'src/environments/environment';
declare var ePayco: any;

@Component({
  selector: 'app-acelerador',
  templateUrl: './acelerador.component.html',
  styleUrls: ['./acelerador.component.scss']
})
export class AceleradorComponent implements OnInit, OnDestroy {

  // Precio fijo de la suscripcion mensual, cobrado en USD por ePayco.
  readonly PRECIO_USD = 35;

  dataUser: any = {};
  tieneAcceso = false;
  verificandoAcceso = true;
  listModules: any[] = [];
  procesandoPago = false;
  videoGancho1: any = null;
  videoGancho2: any = null;
  keyEpayco = environment.keyEpayco;
  estadoPruebaPagos = environment.estadoPruebaPagos;
  private pollingPago: any = null;

  constructor(
    private _store: Store<STORAGES>,
    private _acelerador: AceleradorService,
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

  ngOnDestroy(): void {
    if (this.pollingPago) clearInterval(this.pollingPago);
  }

  cargar() {
    this._acelerador.getModulesWithLessons().subscribe((res: any) => {
      this.listModules = res.data || [];
    });

    if (!this.dataUser.id) {
      this.verificandoAcceso = false;
      return;
    }
    this._acelerador.hasAccess(this.dataUser.id).subscribe((res: any) => {
      this.tieneAcceso = !!res.data;
      this.verificandoAcceso = false;
    });
  }

  suscribirme() {
    if (this.procesandoPago || !this.dataUser.id) return;
    this.procesandoPago = true;
    const codigo = 'SUB-' + this._tools.codigo();
    this._acelerador.createPayment(this.dataUser.id, this.PRECIO_USD, codigo).subscribe((res: any) => {
      if (!res.success) {
        this.procesandoPago = false;
        this._tools.tooast('No pudimos iniciar el pago, intenta de nuevo');
        return;
      }
      this.abrirEpayco(codigo);
      this.iniciarPolling(codigo);
    }, () => {
      this.procesandoPago = false;
      this._tools.tooast('No pudimos iniciar el pago, intenta de nuevo');
    });
  }

  private abrirEpayco(codigo: string) {
    const obj: any = {
      name: 'Suscripcion Acelerador de Ventas',
      invoice: codigo,
      currency: 'usd',
      amount: this.PRECIO_USD,
      tax_base: '0',
      tax: '0',
      country: 'co',
      test: false,
      lang: 'esp',
      external: 'true',
      name_billing: (this.dataUser.usu_nombre || '') + ' ' + (this.dataUser.usu_apellido || ''),
      email_billing: this.dataUser.usu_email,
      address_billing: this.dataUser.usu_ciudad || 'cucuta',
      mobilephone_billing: this.dataUser.usu_telefono,
      number_doc_billing: this.dataUser.usu_documento,
    };
    try {
      const handler: any = ePayco.checkout.configure({ key: this.keyEpayco, test: this.estadoPruebaPagos });
      handler.open(obj);
    } catch (error) {
      this._tools.tooast('Error en el proceso de pago');
    }
  }

  private iniciarPolling(codigo: string) {
    if (this.pollingPago) clearInterval(this.pollingPago);
    let intentos = 0;
    this.pollingPago = setInterval(() => {
      intentos++;
      this._acelerador.getPaymentStatus(codigo).subscribe((res: any) => {
        if (res.success && res.data && res.data.status === 2) {
          clearInterval(this.pollingPago);
          this.pollingPago = null;
          this.procesandoPago = false;
          this.tieneAcceso = true;
          this._tools.tooast({ title: 'Suscripcion activada', icon: 'success' });
        } else if (intentos > 60) {
          clearInterval(this.pollingPago);
          this.pollingPago = null;
          this.procesandoPago = false;
        }
      });
    }, 4000);
  }
}
