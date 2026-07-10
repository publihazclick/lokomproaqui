import { Component, OnInit, OnDestroy } from '@angular/core';
import { Store } from '@ngrx/store';
import { STORAGES } from 'src/app/interfaces/sotarage';
import { ToolsService } from 'src/app/services/tools.service';
import { RechargeService } from 'src/app/servicesComponents/recharge.service';
import { WalletService } from 'src/app/servicesComponents/wallet.service';
import { environment } from 'src/environments/environment';
declare var ePayco: any;

@Component({
  selector: 'app-recharge',
  templateUrl: './recharge.component.html',
  styleUrls: ['./recharge.component.scss']
})
export class RechargeComponent implements OnInit, OnDestroy {

  listRecharge:any = [];
  loader:boolean = false;
  disabedPn:boolean = false;
  selectedId:any = null;
  selectedItem:any = null;
  dataUser:any = {};
  saldo:number = 0;
  keyEpayco = environment.keyEpayco;
  estadoPruebaPagos = environment.estadoPruebaPagos;
  private pollingRecarga:any = null;

  constructor(
    private _recharge: RechargeService,
    private _wallet: WalletService,
    public _tools: ToolsService,
    private _store: Store<STORAGES>,
  ) {
    this._store.subscribe( ( store: any ) => {
      store = store.name;
      if( !store ) return false;
      this.dataUser = store.user || {};
    });
  }

  ngOnInit(): void {
    this.getRecharge();
    this.refrescarSaldo();
  }

  ngOnDestroy(): void {
    if( this.pollingRecarga ) clearInterval( this.pollingRecarga );
  }

  getRecharge(){
    this.loader = true;
    this._recharge.get( {} ).subscribe( res =>{
      this.listRecharge = res.data;
      this.loader = false;
    });
  }

  refrescarSaldo(){
    this._wallet.getBalance( this.dataUser.id ).subscribe( ( res:any ) =>{
      this.saldo = ( res.data && res.data.balance ) || 0;
    });
  }

  selectValue( item:any ){
    if( this.disabedPn ) return false;
    this.selectedItem = item;
  }

  // Recarga la billetera 'dropshipper' (la misma que usan "Hacer Dropshipping"/"Pedir muestra")
  // via wallet_topups, el mismo mecanismo ya probado en dropshipping-checkout.component.ts:
  // el webhook de ePayco (invoice con prefijo TOPUP-) acredita el saldo cuando confirma el pago.
  handleActivatePackage( item:any ){
    if( this.disabedPn || !item ) return false;
    this.disabedPn = true;
    this.selectedId = item.id;
    const codigo = 'TOPUP-' + this._tools.codigo();
    this._wallet.createTopup( this.dataUser.id, item.precio, codigo ).subscribe( ( res:any ) =>{
      if( !res.success ){
        this.disabedPn = false;
        this.selectedId = null;
        this._tools.tooast("No pudimos iniciar la recarga, intenta de nuevo");
        return;
      }
      this.nextEpayco( item, codigo );
      this.iniciarPollingRecarga( codigo );
    },()=> {
      this.disabedPn = false;
      this.selectedId = null;
      this._tools.tooast("No pudimos iniciar la recarga, intenta de nuevo");
    } );
  }

  private iniciarPollingRecarga( codigo:string ){
    if( this.pollingRecarga ) clearInterval( this.pollingRecarga );
    let intentos = 0;
    this.pollingRecarga = setInterval( () =>{
      intentos++;
      this._wallet.getTopupStatus( codigo ).subscribe( ( res:any ) =>{
        if( res.success && res.data && res.data.status === 2 ){
          clearInterval( this.pollingRecarga );
          this.pollingRecarga = null;
          this.disabedPn = false;
          this.selectedId = null;
          this.selectedItem = null;
          this.refrescarSaldo();
          this._tools.tooast({ title: "Recarga confirmada", icon: "success" });
        } else if( intentos > 60 ){
          clearInterval( this.pollingRecarga );
          this.pollingRecarga = null;
          this.disabedPn = false;
        }
      });
    }, 4000 );
  }

  nextEpayco( item:any, codigo:string ){
    let obj:any = {
        url: "https://recaudos.pagosinteligentes.com/CollectForm.aspx?Token=be3c7e95-5c30-47e3-9209-9e88a2e6f57d",
        otrourl: "https://publihazclick.s3.amazonaws.com/paquetes/19fd8728-c89b-44c7-951b-79dcbbace3ff.jpg",
        wester: "https://www.google.com.co/",
        imgwester: "https://www.viviendocali.com/wp-content/uploads/2017/10/Western-Union-en-bucaramanga.jpg",
        name: item.titulo,
        invoice: codigo,
        currency: 'cop',
        amount: item.precio,
        tax_base: '0',
        tax: '0',
        country: 'co',
        test: false,
        lang: 'eng',
        external: 'true',
        extra1: 'extra1',
        extra2: 'extra2',
        extra3: 'extra3',
        name_billing: this.dataUser.name + ' ' + this.dataUser.lastname,
        email_billing: this.dataUser.email,
        address_billing: this.dataUser.ciudad || 'cucuta',
        type_doc_billing: this.dataUser.tipdoc,
        mobilephone_billing: this.dataUser.celular,
        number_doc_billing: this.dataUser.celular
    };
    //console.log( obj)
    try {
      const handler: any = ePayco.checkout.configure({
        key: this.keyEpayco,
        test: this.estadoPruebaPagos
      })
        ;
      handler.open(obj);
    } catch (error) {
      console.log("************", error)
      this._tools.tooast("Eror en el proceso de compra");
    }
  }

}
