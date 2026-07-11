import { Component, OnInit, OnDestroy } from '@angular/core';
import { ToolsService } from 'src/app/services/tools.service';

@Component({
  selector: 'app-contador-shipping',
  templateUrl: './contador-shipping.component.html',
  styleUrls: ['./contador-shipping.component.scss']
})
export class ContadorShippingComponent implements OnInit, OnDestroy {
  contect: any = {
    contadorC: 0,
    titleC: "Comercios <br> Registrados",
    contadorD: 0,
    titleD: "Proveedores <br> dropshipping",
    contadorE: 0,
    titleE: "Envios diarios",
    contadorM: 0,
    titleM: "Municipios bajo <br> Cobertura"
  };

  // Orden de la animacion (2026-07-11, pedido explicito del usuario): de menos a mas, un
  // recuadro a la vez — recien cuando uno termina de contar arranca el siguiente.
  // Bug real corregido (2026-07-11): con paso 5ms + step chico, el primer recuadro solo
  // (Comercios, hasta 12.103) tardaba ~30 segundos en terminar antes de que el segundo se
  // moviera un solo pixel — con esa espera tan larga se veia como si no pasara nada. Ademas
  // 5ms (200 actualizaciones por segundo) fuerza demasiados ciclos de deteccion de cambios de
  // Angular, pesado sobre todo en celular. Se recalculan los pasos para que cada recuadro
  // termine en ~1-1.5s, con un intervalo mas liviano (20ms).
  private secuencia = [
    { key: 'contadorC', target: 12103, step: 160 },
    { key: 'contadorD', target: 236, step: 5 },
    { key: 'contadorE', target: 2457, step: 33 },
    { key: 'contadorM', target: 1100, step: 22 },
  ];
  private intervalo: any = null;

  constructor(
    public _tools: ToolsService
  ) { }

  ngOnInit(): void {
    this.animarSiguiente(0);
  }

  ngOnDestroy(): void {
    if (this.intervalo) clearInterval(this.intervalo);
  }

  private animarSiguiente(idx: number) {
    if (idx >= this.secuencia.length) return;
    const item = this.secuencia[idx];
    this.intervalo = setInterval(() => {
      this.contect[item.key] = Math.min(this.contect[item.key] + item.step, item.target);
      if (this.contect[item.key] >= item.target) {
        clearInterval(this.intervalo);
        this.animarSiguiente(idx + 1);
      }
    }, 20);
  }

}
