import { Component, OnInit } from '@angular/core';
import { Store } from '@ngrx/store';
import { STORAGES } from 'src/app/interfaces/sotarage';
import { ToolsService } from 'src/app/services/tools.service';
import { WoocommerceService } from 'src/app/servicesComponents/woocommerce.service';

@Component({
  selector: 'app-woocommerce-connect',
  templateUrl: './woocommerce-connect.component.html',
  styleUrls: ['./woocommerce-connect.component.scss']
})
export class WoocommerceConnectComponent implements OnInit {

  dataUser: any = {};
  connection: any = null;
  loader: boolean = true;
  saving: boolean = false;

  form: any = { store_url: '', consumer_key: '', consumer_secret: '' };

  constructor(
    private _woocommerce: WoocommerceService,
    public _tools: ToolsService,
    private _store: Store<STORAGES>,
  ) {
    this._store.subscribe((store: any) => {
      store = store.name;
      if (!store) return false;
      this.dataUser = store.user || {};
    });
  }

  ngOnInit(): void {
    this.cargarConexion();
  }

  cargarConexion() {
    if (!this.dataUser.id) { this.loader = false; return; }
    this.loader = true;
    this._woocommerce.getConnection(this.dataUser.id).subscribe(res => {
      this.connection = (res && res.data) || null;
      this.loader = false;
    }, () => this.loader = false);
  }

  conectar() {
    if (this.saving) return;
    if (!this.form.store_url || !this.form.consumer_key || !this.form.consumer_secret) {
      this._tools.openSnack('Completa los 3 campos para conectar tu tienda', 'error', false);
      return;
    }
    this.saving = true;
    this._woocommerce.connect({
      profile_id: this.dataUser.id,
      store_url: this.form.store_url,
      consumer_key: this.form.consumer_key,
      consumer_secret: this.form.consumer_secret,
    }).subscribe(res => {
      this.saving = false;
      if (!res.success) {
        this._tools.openSnack(res.message || 'No se pudo conectar la tienda', 'error', false);
        return;
      }
      this._tools.openSnack('Tienda de WooCommerce conectada correctamente', 'completado', false);
      this.form = { store_url: '', consumer_key: '', consumer_secret: '' };
      this.cargarConexion();
    }, () => {
      this.saving = false;
      this._tools.openSnack('No se pudo conectar la tienda, intenta de nuevo', 'error', false);
    });
  }

  desconectar() {
    if (this.saving) return;
    this.saving = true;
    this._woocommerce.disconnect(this.dataUser.id).subscribe(res => {
      this.saving = false;
      if (!res.success) {
        this._tools.openSnack('No se pudo desconectar la tienda', 'error', false);
        return;
      }
      this._tools.openSnack('Tienda desconectada', 'completado', false);
      this.connection = null;
    }, () => this.saving = false);
  }

}
