import { Component, OnInit, OnDestroy } from '@angular/core';
import { Store } from '@ngrx/store';
import { STORAGES } from 'src/app/interfaces/sotarage';
import { ToolsService } from 'src/app/services/tools.service';
import { AceleradorService } from 'src/app/servicesComponents/acelerador.service';
import { UsuariosService } from 'src/app/servicesComponents/usuarios.service';
import { UserAction, TokenAction } from 'src/app/redux/app.actions';
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

  // Pago sin sesion: se pide solo lo que ePayco ya necesita para el cobro (nombre, correo,
  // telefono, documento, ciudad). Con eso se crea la cuenta por detras (misma via que el
  // registro normal) y se continua al pago sin que el usuario note que "se registro".
  mostrarFormAnon = false;
  procesandoCuenta = false;
  pagoFueAnonimo = false;
  anonData: any = { usu_nombre: '', usu_email: '', usu_telefono: '', usu_documento: '', usu_ciudad: '' };

  constructor(
    private _store: Store<STORAGES>,
    private _acelerador: AceleradorService,
    private _usuarios: UsuariosService,
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

  pagarAnonimo() {
    if (this.procesandoCuenta || this.procesandoPago) return;
    const d = this.anonData;
    if (!d.usu_nombre || !d.usu_email || !d.usu_telefono || !d.usu_documento) {
      this._tools.tooast('Completa nombre, correo, telefono y documento');
      return;
    }
    this.procesandoCuenta = true;
    const claveTemp = this._tools.codigo() + this._tools.codigo().toLowerCase();
    this._usuarios.create({
      usu_email: d.usu_email.trim(),
      usu_clave: claveTemp,
      usu_nombre: d.usu_nombre,
      usu_telefono: d.usu_telefono,
    }).subscribe((res: any) => {
      if (!res.success) {
        this.procesandoCuenta = false;
        this._tools.tooast(res.message || 'No pudimos continuar, intenta de nuevo');
        return;
      }
      this.dataUser = res.data;
      this.pagoFueAnonimo = true;
      this._store.dispatch(new UserAction(res.data, 'post'));
      this._store.dispatch(new TokenAction({ token: res.data.tokens }, 'post'));

      // Guarda documento/ciudad que la cuenta recien creada aun no tiene (el trigger de signup
      // solo copia nombre/telefono) -- ePayco los necesita como datos de facturacion.
      this._usuarios.update({
        id: res.data.id,
        usu_email: res.data.usu_email,
        tokens: res.data.tokens,
        usu_documento: d.usu_documento,
        usu_ciudad: d.usu_ciudad,
      }).subscribe((res2: any) => {
        if (res2 && res2.id) {
          this.dataUser = res2;
          this._store.dispatch(new UserAction(res2, 'put'));
        }
        this.procesandoCuenta = false;
        this.mostrarFormAnon = false;
        this.suscribirme();
      }, () => {
        this.procesandoCuenta = false;
        this.mostrarFormAnon = false;
        this.suscribirme();
      });
    }, () => {
      this.procesandoCuenta = false;
      this._tools.tooast('No pudimos continuar, intenta de nuevo');
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
          if (this.pagoFueAnonimo) {
            this._tools.basicIcons({
              header: 'Suscripcion activada',
              subheader: `Guardamos tu acceso con el correo ${this.dataUser.usu_email}. Para volver a entrar mas adelante desde otro dispositivo, usa "Olvide mi contrasena" en el login con ese mismo correo.`,
              icon: 'success',
            });
          } else {
            this._tools.tooast({ title: 'Suscripcion activada', icon: 'success' });
          }
        } else if (intentos > 60) {
          clearInterval(this.pollingPago);
          this.pollingPago = null;
          this.procesandoPago = false;
        }
      });
    }, 4000);
  }
}
