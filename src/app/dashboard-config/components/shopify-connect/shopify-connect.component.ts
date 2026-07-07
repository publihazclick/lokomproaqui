import { Component, OnInit } from '@angular/core';
import { Store } from '@ngrx/store';
import { STORAGES } from 'src/app/interfaces/sotarage';
import { ToolsService } from 'src/app/services/tools.service';
import { ShopifyService } from 'src/app/servicesComponents/shopify.service';

@Component({
  selector: 'app-shopify-connect',
  templateUrl: './shopify-connect.component.html',
  styleUrls: ['./shopify-connect.component.scss']
})
export class ShopifyConnectComponent implements OnInit {

  dataUser: any = {};
  connection: any = null;
  loader: boolean = true;
  saving: boolean = false;

  form: any = { shop_domain: '', access_token: '', api_secret: '' };

  constructor(
    private _shopify: ShopifyService,
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
    this._shopify.getConnection(this.dataUser.id).subscribe(res => {
      this.connection = (res && res.data) || null;
      this.loader = false;
    }, () => this.loader = false);
  }

  conectar() {
    if (this.saving) return;
    if (!this.form.shop_domain || !this.form.access_token || !this.form.api_secret) {
      this._tools.openSnack('Completa los 3 campos para conectar tu tienda', 'error', false);
      return;
    }
    this.saving = true;
    this._shopify.connect({
      profile_id: this.dataUser.id,
      shop_domain: this.form.shop_domain,
      access_token: this.form.access_token,
      api_secret: this.form.api_secret,
    }).subscribe(res => {
      this.saving = false;
      if (!res.success) {
        this._tools.openSnack(res.message || 'No se pudo conectar la tienda', 'error', false);
        return;
      }
      this._tools.openSnack('Tienda de Shopify conectada correctamente', 'completado', false);
      this.form = { shop_domain: '', access_token: '', api_secret: '' };
      this.cargarConexion();
    }, () => {
      this.saving = false;
      this._tools.openSnack('No se pudo conectar la tienda, intenta de nuevo', 'error', false);
    });
  }

  desconectar() {
    if (this.saving) return;
    this.saving = true;
    this._shopify.disconnect(this.dataUser.id).subscribe(res => {
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
