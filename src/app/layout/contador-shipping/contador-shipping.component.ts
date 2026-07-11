import { Component, OnInit } from '@angular/core';
import { ToolsService } from 'src/app/services/tools.service';

@Component({
  selector: 'app-contador-shipping',
  templateUrl: './contador-shipping.component.html',
  styleUrls: ['./contador-shipping.component.scss']
})
export class ContadorShippingComponent implements OnInit {
  contect = {
    contadorC: 0,
    titleC: "Comercios <br> Registrados",
    contadorD: 0,
    titleD: "Proveedores <br> dropshipping",
    contadorE: 0,
    titleE: "Envios diarios",
    contadorM: 0,
    titleM: "Municipios bajo <br> Cobertura"
  };
  constructor(
    public _tools: ToolsService
  ) { }

  ngOnInit(): void {
    setInterval(()=>{
      if( this.contect.contadorC < 12103 ) this.contect.contadorC = Math.min( this.contect.contadorC + 2, 12103 );
      if( this.contect.contadorD < 236 ) this.contect.contadorD++;
      if( this.contect.contadorE < 2457 ) this.contect.contadorE = Math.min( this.contect.contadorE + 10, 2457 );
      if( this.contect.contadorM < 1100 ) this.contect.contadorM++;
    }, 5 )
  }

}
