import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { CART } from 'src/app/interfaces/sotarage';
import { departamento } from 'src/app/JSON/departamentos';
import { CartAction } from 'src/app/redux/app.actions';
import { ToolsService } from 'src/app/services/tools.service';
import { VentasService } from 'src/app/servicesComponents/ventas.service';

@Component({
  selector: 'app-checkt',
  templateUrl: './checkt.component.html',
  styleUrls: ['./checkt.component.scss']
})
export class ChecktComponent implements OnInit {
  
  data:any = {};
  listCiudad:any = departamento || [];
  listCarrito:any = [];
  totalSuma:number = 0;
  vista = 'inicial';
  valor:boolean = true;
  disabled:boolean = false;
  vista1:string = "inicial";

  tiendaInfo:any = {};

  constructor(
    private _store: Store<CART>,
    public _tools: ToolsService,
    private _ventas: VentasService,
    private _router: Router
  ) {
    this._store.subscribe((store: any) => {
      //console.log(store);
      store = store.name;
      if(!store) return false;
      this.listCarrito = store.cart || [];
      this.tiendaInfo = store.usercabeza || {};
      this.suma();
    });
  }

  ngOnInit(): void {
    if( this.listCarrito.length == 0 ) this._router.navigate(['/front/productos']);
  }

  suma(){
    for( let row of this.listCarrito ) this.totalSuma+= row.costoTotal
  }

  borrar( idx:any, item:any ){
    this.listCarrito.splice(idx, 1);
    let accion = new CartAction(item, 'delete');
    this._store.dispatch(accion);
  }
  validadornext(){
    if( !this.data.nombre ) return this._tools.tooast({ title: "Error Por Favor Completar campos nombre", icon: "error" });
    if( !this.data.telefono ) return this._tools.tooast({ title: "Error Por Favor Completar campos telefono", icon: "error" });
    if( !this.data.ciudad ) return this._tools.tooast({ title: "Error Por Favor Completar campos ciudad", icon: "error" });
    if( !this.data.barrio ) return this._tools.tooast({ title: "Error Por Favor Completar campos barrio", icon: "error" });
    if( !this.data.direccion ) return this._tools.tooast({ title: "Error Por Favor Completar campos direccion", icon: "error" });
    if( !this.data.apartamento ) return this._tools.tooast({ title: "Error Por Favor Completar campos apartamento", icon: "error" });
    if( !this.data.departamento ) return this._tools.tooast({ title: "Error Por Favor Completar campos departamento", icon: "error" });
    this.vista = "segunda";
  }

  async finalizando(){
    if( this.disabled ) return false;
    this.disabled = true;

    const orderInfo = {
      seller_id: this.tiendaInfo.id || null,
      buyer_name: this.data.nombre,
      buyer_phone: this.data.telefono,
      buyer_address: this.data.direccion + (this.data.apartamento ? ' Apto ' + this.data.apartamento : ''),
      buyer_city: this.data.ciudad,
      buyer_neighborhood: this.data.barrio,
    };

    this._ventas.createOrder(orderInfo, this.listCarrito).subscribe((res: any) => {
      this.disabled = false;
      if (!res.success) {
        return this._tools.presentToast(res.message || 'No pudimos procesar tu pedido');
      }
      this._tools.presentToast("Exitoso Tu pedido esta en proceso. un accesor se pondra en contacto contigo!");
      this.vista1 = "segunda";
      this.data = {};
      this.listCarrito = [];
      let accion = new CartAction( { }, 'drop');
      this._store.dispatch( accion );
    }, () => {
      this.disabled = false;
      this._tools.presentToast('Error de servidor, intenta de nuevo');
    });
  }
}
