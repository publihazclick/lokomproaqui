import { Component, OnInit } from '@angular/core';
import { Store } from '@ngrx/store';
import { STORAGES } from 'src/app/interfaces/sotarage';
import { ToolsService } from 'src/app/services/tools.service';
import { WoocommerceService } from 'src/app/servicesComponents/woocommerce.service';
import { ProductoService } from 'src/app/servicesComponents/producto.service';

@Component({
  selector: 'app-woocommerce-pending',
  templateUrl: './woocommerce-pending.component.html',
  styleUrls: ['./woocommerce-pending.component.scss']
})
export class WoocommercePendingComponent implements OnInit {

  dataUser: any = {};
  loader: boolean = true;
  saving: boolean = false;
  pendingOrders: any[] = [];

  // Resultados de busqueda de producto por item: { [pendingOrderId_itemIndex]: any[] }
  searchResults: any = {};

  constructor(
    private _woocommerce: WoocommerceService,
    private _producto: ProductoService,
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
    this.cargar();
  }

  cargar() {
    if (!this.dataUser.id) { this.loader = false; return; }
    this.loader = true;
    this._woocommerce.getPendingOrders(this.dataUser.id).subscribe(res => {
      this.pendingOrders = (res && res.data) || [];
      this.loader = false;
    }, () => this.loader = false);
  }

  buscarProducto(term: string, pendingOrderId: number, itemIndex: number) {
    const key = pendingOrderId + '_' + itemIndex;
    if (!term || term.length < 2) { this.searchResults[key] = []; return; }
    this._producto.get({ where: { or: [{ pro_nombre: { contains: term } }] }, limit: 10 }).subscribe(res => {
      this.searchResults[key] = (res && res.data) || [];
    });
  }

  seleccionarProducto(item: any, pendingOrderId: number, itemIndex: number, producto: any) {
    item.product_id = producto.id;
    item.product_variant_id = null;
    item._productoNombre = producto.pro_nombre;
    item._variantes = [];
    (producto.listColor || []).forEach((grupo: any) => {
      (grupo.tallaSelect || []).forEach((v: any) => {
        item._variantes.push({ id: v.id, label: [grupo.talla, v.tal_descripcion].filter((x: string) => x && x !== 'unico').join(' - ') || 'Unica' });
      });
    });
    const key = pendingOrderId + '_' + itemIndex;
    this.searchResults[key] = [];
  }

  todoListoParaConfirmar(pending: any): boolean {
    return (pending.items || []).every((it: any) => !!it.product_id);
  }

  confirmarPedido(pending: any) {
    if (this.saving) return;
    if (!this.todoListoParaConfirmar(pending)) {
      this._tools.openSnack('Falta relacionar algun producto antes de confirmar', 'error', false);
      return;
    }
    this.saving = true;
    this._woocommerce.resolvePendingOrder(pending, this.dataUser.id, pending.items).subscribe(res => {
      this.saving = false;
      if (!res.success) {
        this._tools.openSnack(res.message || 'No se pudo crear el pedido', 'error', false);
        return;
      }
      this._tools.openSnack('Pedido creado y enviado a Autorizar Despacho', 'completado', false);
      this.pendingOrders = this.pendingOrders.filter((p: any) => p.id !== pending.id);
    }, () => {
      this.saving = false;
      this._tools.openSnack('No se pudo crear el pedido, intenta de nuevo', 'error', false);
    });
  }

}
