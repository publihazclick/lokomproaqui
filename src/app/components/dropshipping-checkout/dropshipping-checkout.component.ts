import { Component, OnInit, OnDestroy, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material';
import { VentasService } from 'src/app/servicesComponents/ventas.service';
import { WalletService } from 'src/app/servicesComponents/wallet.service';
import { ToolsService } from 'src/app/services/tools.service';
import { environment } from 'src/environments/environment';

declare var ePayco: any;

// Checkout de "Hacer Dropshipping" / "Pedir muestra": crea el pedido, cotiza y genera el envio
// real con Mipaquete, y cobra el total (producto + flete) de la billetera prepago 'dropshipper'
// del propio usuario. Ver plan en C:\Users\MOINS\.claude\plans\linear-napping-noodle.md.
@Component({
  selector: 'app-dropshipping-checkout',
  templateUrl: './dropshipping-checkout.component.html',
  styleUrls: ['./dropshipping-checkout.component.scss']
})
export class DropshippingCheckoutComponent implements OnInit, OnDestroy {

  mode: 'dropshipping' | 'muestra';
  producto: any = {};
  dataUser: any = {};

  // datos -> flete -> resumen -> exito
  paso: string = 'datos';
  loader: boolean = false;
  error: string = '';

  precioUnitario: number = 0;
  cantidad: number = 1;

  cliente = {
    nombre: '',
    telefono: '',
    direccion: '',
    barrio: '',
  };
  destinatarioBloqueado: boolean = false;

  ciudadQuery: string = '';
  sugerencias: any[] = [];
  ciudadFocus: boolean = false;
  ciudadSeleccionada: any = null;
  private ciudadDebounce: any = null;

  cotizando: boolean = false;
  cotizaciones: any[] = [];
  fleteSeleccionado: any = null;

  orderId: any = null;
  guiaGenerada: string = '';

  saldo: number = 0;
  mostrarRecarga: boolean = false;
  procesandoRecarga: boolean = false;
  montoRecarga: number = 30000;
  montosSugeridos = [30000, 50000, 100000, 200000, 500000];
  private pollingRecarga: any = null;

  opcionCurrencys: any = {};
  keyEpayco = environment.keyEpayco;
  estadoPruebaPagos = environment.estadoPruebaPagos;

  constructor(
    public dialogRef: MatDialogRef<DropshippingCheckoutComponent>,
    @Inject(MAT_DIALOG_DATA) public datas: any,
    private _ventas: VentasService,
    private _wallet: WalletService,
    public _tools: ToolsService,
  ) {
    this.mode = this.datas.mode;
    this.producto = this.datas.producto || {};
    this.dataUser = this.datas.dataUser || {};
  }

  ngOnInit() {
    this.opcionCurrencys = this._tools.currency;
    this.cantidad = this.producto.cantidadAdquirir || 1;
    this.precioUnitario = this.mode === 'muestra'
      ? (this.producto.pro_vendedor || 0)
      : (this.producto.pro_uni_venta || 0);

    if (this.mode === 'muestra') {
      // Pedir muestra: le llega al propio dropshipper, no a un tercero.
      this.destinatarioBloqueado = true;
      this.cliente.nombre = [this.dataUser.usu_nombre, this.dataUser.usu_apellido].filter(Boolean).join(' ');
      this.cliente.telefono = this.dataUser.usu_telefono || '';
      this.cliente.direccion = this.dataUser.usu_direccion || '';
      this.ciudadQuery = this.dataUser.usu_ciudad || '';
    }

    this.refrescarSaldo();
  }

  ngOnDestroy() {
    if (this.ciudadDebounce) clearTimeout(this.ciudadDebounce);
    if (this.pollingRecarga) clearInterval(this.pollingRecarga);
  }

  get subtotal(): number {
    return this.precioUnitario * (Number(this.cantidad) || 0);
  }

  get totalAPagar(): number {
    if (!this.fleteSeleccionado) return this.subtotal;
    return this.subtotal + (this.fleteSeleccionado.fleteTotal || 0);
  }

  get saldoInsuficiente(): boolean {
    return this.totalAPagar > this.saldo;
  }

  refrescarSaldo() {
    this._wallet.getBalance(this.dataUser.id).subscribe((res: any) => {
      this.saldo = (res.data && res.data.balance) || 0;
    });
  }

  formValido(): boolean {
    return !!this.cliente.nombre.trim()
      && !!this.cliente.telefono.trim()
      && !!this.cliente.direccion.trim()
      && !!this.ciudadSeleccionada
      && (Number(this.cantidad) || 0) >= 1;
  }

  // ── Ciudad (autocompletar contra Mipaquete) ─────────────────────────────
  onCiudadInput() {
    this.ciudadSeleccionada = null;
    this.fleteSeleccionado = null;
    this.cotizaciones = [];
    clearTimeout(this.ciudadDebounce);
    this.ciudadDebounce = setTimeout(() => this.buscarCiudades(), 250);
  }

  onCiudadBlur() {
    setTimeout(() => this.ciudadFocus = false, 180);
  }

  buscarCiudades() {
    const q = (this.ciudadQuery || '').trim();
    if (q.length < 2) { this.sugerencias = []; return; }
    this._ventas.getCiudades({ q }).subscribe((res: any) => {
      this.sugerencias = (res.data || []).map((c: any) => ({ name: c.name, code: c.code }));
    }, () => { this.sugerencias = []; });
  }

  seleccionarCiudad(c: any) {
    this.ciudadSeleccionada = c;
    this.ciudadQuery = c.name;
    this.sugerencias = [];
    this.ciudadFocus = false;
  }

  limpiarCiudad() {
    this.ciudadSeleccionada = null;
    this.ciudadQuery = '';
    this.fleteSeleccionado = null;
    this.cotizaciones = [];
  }

  // ── Paso 1: crear el pedido y pasar a cotizar ───────────────────────────
  continuar() {
    if (!this.formValido() || this.loader) return;
    this.loader = true;
    this.error = '';

    this._ventas.create2({
      usu_clave_int: this.dataUser.id,
      pro_clave_int: this.producto.id,
      ven_tallas: this.producto.tallas || null,
      ven_observacion: (this.producto.color && this.producto.color !== 'null') ? this.producto.color : null,
      ven_cantidad: this.cantidad,
      ven_precio: this.precioUnitario,
      ven_total: this.subtotal,
      nombreProducto: this.producto.pro_nombre,
      ven_nombre_cliente: this.cliente.nombre.trim(),
      ven_telefono_cliente: this.cliente.telefono.trim(),
      ven_direccion_cliente: this.cliente.direccion.trim(),
      ven_ciudad: this.ciudadSeleccionada.name,
      ven_barrio: this.cliente.barrio.trim() || null,
      ven_tipo: this.mode,
    }).subscribe((res: any) => {
      this.loader = false;
      if (!res.success || !res.id) {
        this.error = 'No pudimos crear el pedido, intenta de nuevo';
        return;
      }
      this.orderId = res.id;
      this.cotizar();
    }, () => {
      this.loader = false;
      this.error = 'No pudimos crear el pedido, intenta de nuevo';
    });
  }

  // ── Paso 2: cotizar flete para el pedido ya creado ──────────────────────
  cotizar() {
    if (!this.orderId || !this.ciudadSeleccionada) return;
    this.cotizando = true;
    this.error = '';
    this._ventas.getFleteValor({ id: this.orderId, codeCiudad: this.ciudadSeleccionada.code }).subscribe((res: any) => {
      this.cotizando = false;
      this.cotizaciones = res.data || [];
      this.paso = 'flete';
      if (!this.cotizaciones.length) {
        this.error = 'No hay transportadoras disponibles para esa ciudad';
      }
    }, () => {
      this.cotizando = false;
      this.error = 'No pudimos cotizar el envio, intenta de nuevo';
    });
  }

  elegirFlete(c: any) {
    this.fleteSeleccionado = c;
    this.paso = 'resumen';
    this.refrescarSaldo();
  }

  // ── Paso 3: cobrar y generar la guia ─────────────────────────────────────
  confirmarPago() {
    if (this.loader) return;
    if (this.saldoInsuficiente) { this.abrirRecarga(); return; }

    this.loader = true;
    this.error = '';
    this._wallet.debit(this.dataUser.id, this.totalAPagar, this.orderId).subscribe((res: any) => {
      if (!res.success) {
        this.loader = false;
        this.error = res.message || 'No pudimos procesar el pago';
        this.refrescarSaldo();
        return;
      }
      this.generarGuia();
    }, () => {
      this.loader = false;
      this.error = 'No pudimos procesar el pago con tu billetera';
    });
  }

  private generarGuia() {
    this._ventas.createFelte({ id: this.orderId, transportadoraSelect: this.fleteSeleccionado.slug }).subscribe((res: any) => {
      this.loader = false;
      if (!res.data || res.data.status !== 200) {
        this.error = 'Ya cobramos tu pedido pero no pudimos generar la guia de envio';
        this.guiaGenerada = '';
        return;
      }
      this.guiaGenerada = res.data.nRemesa || res.data.sending_id || '';
      this._ventas.update({ id: this.orderId, ven_estado: 6 }).subscribe(() => {
        this.paso = 'exito';
      });
    }, () => {
      this.loader = false;
      this.error = 'Ya cobramos tu pedido pero no pudimos generar la guia de envio';
    });
  }

  reintentarGuia() {
    this.loader = true;
    this.error = '';
    this.generarGuia();
  }

  async cancelarYReembolsar() {
    const confirmado = await this._tools.confirm({
      title: 'Cancelar pedido',
      detalle: 'Se te devolvera el saldo debitado a tu billetera',
      confir: 'Si, cancelar',
    });
    if (!confirmado || !confirmado.value) return;

    this.loader = true;
    this._wallet.refund(this.dataUser.id, this.totalAPagar, this.orderId).subscribe(() => {
      this._ventas.update({ id: this.orderId, ven_estado: 2 }).subscribe(() => {
        this.loader = false;
        this._tools.tooast({ title: 'Pedido cancelado y saldo devuelto', icon: 'success' });
        this.dialogRef.close();
      });
    }, () => {
      this.loader = false;
      this.error = 'No pudimos reembolsar el saldo, contacta a soporte';
    });
  }

  // ── Recarga de billetera (inline, via ePayco) ───────────────────────────
  abrirRecarga() {
    this.error = '';
    this.mostrarRecarga = true;
  }

  cerrarRecarga() {
    this.mostrarRecarga = false;
    if (this.pollingRecarga) { clearInterval(this.pollingRecarga); this.pollingRecarga = null; }
  }

  lanzarRecarga() {
    const monto = Number(this.montoRecarga) || 0;
    if (monto < 10000) { this.error = 'El monto minimo de recarga es $10.000'; return; }
    if (this.procesandoRecarga) return;
    this.procesandoRecarga = true;
    this.error = '';

    const codigo = 'TOPUP-' + this._tools.codigo();
    this._wallet.createTopup(this.dataUser.id, monto, codigo).subscribe((res: any) => {
      this.procesandoRecarga = false;
      if (!res.success) {
        this.error = 'No pudimos iniciar la recarga, intenta de nuevo';
        return;
      }
      this.abrirEpaycoRecarga(monto, codigo);
      this.iniciarPollingRecarga(codigo);
    }, () => {
      this.procesandoRecarga = false;
      this.error = 'No pudimos iniciar la recarga, intenta de nuevo';
    });
  }

  private abrirEpaycoRecarga(monto: number, codigo: string) {
    const obj: any = {
      name: 'Recarga billetera dropshipper',
      invoice: codigo,
      currency: 'cop',
      amount: monto,
      tax_base: '0',
      tax: '0',
      country: 'co',
      test: false,
      lang: 'es',
      external: 'true',
      name_billing: [this.dataUser.usu_nombre, this.dataUser.usu_apellido].filter(Boolean).join(' '),
      email_billing: this.dataUser.usu_email,
      mobilephone_billing: this.dataUser.usu_telefono,
    };
    try {
      const handler: any = ePayco.checkout.configure({ key: this.keyEpayco, test: this.estadoPruebaPagos });
      handler.open(obj);
    } catch (error) {
      this._tools.tooast({ title: 'Error abriendo el pago', icon: 'error' });
    }
  }

  private iniciarPollingRecarga(codigo: string) {
    if (this.pollingRecarga) clearInterval(this.pollingRecarga);
    let intentos = 0;
    this.pollingRecarga = setInterval(() => {
      intentos++;
      this._wallet.getTopupStatus(codigo).subscribe((res: any) => {
        if (res.success && res.data && res.data.status === 2) {
          clearInterval(this.pollingRecarga);
          this.pollingRecarga = null;
          this.refrescarSaldo();
          this.mostrarRecarga = false;
          this._tools.tooast({ title: 'Recarga confirmada', icon: 'success' });
        } else if (intentos > 60) {
          clearInterval(this.pollingRecarga);
          this.pollingRecarga = null;
        }
      });
    }, 4000);
  }

  cerrar() {
    this.dialogRef.close();
  }
}
