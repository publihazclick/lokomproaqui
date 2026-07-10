import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';
import { ToolsService } from 'src/app/services/tools.service';
import { VentasService } from 'src/app/servicesComponents/ventas.service';

// Confirma y genera la guia real de envio via Mipaquete (createFelte -> edge function
// mipaquete-create-shipment). Bug real corregido (2026-07-10): esta llamada nunca mandaba el id
// del pedido, asi que SIEMPRE fallaba (createFelte exige id+transportadoraSelect). El componente
// viejo tambien tenia campos editables (peso real, alto, largo, ancho, valor a asegurar) heredados
// de la API vieja de Coordinadora que NUNCA le llegaban a Mipaquete — el edge function calcula
// peso/dimensiones/valor declarado del lado del servidor a partir de order_items/products, asi que
// se quitaron por ser pura UI muerta que aparentaba funcionar sin hacer nada.
@Component({
  selector: 'app-formcrearguia',
  templateUrl: './formcrearguia.component.html',
  styleUrls: ['./formcrearguia.component.scss']
})
export class FormcrearguiaComponent implements OnInit {

  data: any = {};
  btndisabled: boolean = false;
  opcionCurrencys: any;
  transportadoraNombre: string = '';

  constructor(
    public dialogRef: MatDialogRef<FormcrearguiaComponent>,
    @Inject(MAT_DIALOG_DATA) public datas: any,
    private _ventas: VentasService,
    private _tools: ToolsService
  ) {
    this.opcionCurrencys = this._tools.currency;
  }

  ngOnInit(): void {
    this.data = this.datas.datos || {};
    // selectTrans() en formventas.component.ts guarda el objeto completo de la cotizacion elegida
    // (incluye el nombre legible de la transportadora) como JSON en historySettlementFletes.
    try {
      const cotizacion = JSON.parse(this.data.historySettlementFletes || '{}');
      this.transportadoraNombre = cotizacion.nombre || this.data.transportadoraSelect || '';
    } catch {
      this.transportadoraNombre = this.data.transportadoraSelect || '';
    }
  }

  submit() {
    if (this.btndisabled) return;
    if (!this.data.id || !this.data.transportadoraSelect) {
      this._tools.basicIcons({ header: "Error!", subheader: "Falta el pedido o la transportadora, cierra y vuelve a intentar" });
      return;
    }
    this.btndisabled = true;
    this._ventas.createFelte({ id: this.data.id, transportadoraSelect: this.data.transportadoraSelect }).subscribe((res: any) => {
      res = res.data;
      this.btndisabled = false;
      if (res.status !== 200) {
        this._tools.basicIcons({ header: "Error!", subheader: res.message || "No pudimos crear la guia, intenta de nuevo" });
        return;
      }
      this._tools.basicIcons({ header: "Exitoso!", subheader: "Guia generada #" + res.nRemesa });
      this.dialogRef.close(res);
    }, () => {
      this.btndisabled = false;
      this._tools.basicIcons({ header: "Error!", subheader: "No pudimos crear la guia, intenta de nuevo" });
    });
  }

}
