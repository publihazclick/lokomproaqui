import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
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
  // Bug real corregido (2026-07-11): el diseño anterior creaba un setInterval NUEVO por cada
  // recuadro (recursivo, guardando la referencia en this.intervalo y limpiandola al terminar).
  // En produccion se quedaba pegado en el primer paso del primer recuadro ("+160", exactamente
  // el step, nunca avanzaba mas) — probablemente porque algo disparaba un segundo arranque
  // (ngOnInit corriendo mas de una vez) y la segunda referencia de intervalo pisaba a la
  // primera, dejando el intervalo original huerfano sin nadie que lo seleccione para limpiar o
  // seguir. Se simplifica a UN SOLO setInterval para toda la secuencia (nunca se crea uno
  // nuevo a mitad de camino) + una bandera que evita arrancar dos veces si ngOnInit se llega a
  // disparar mas de una vez.
  private secuencia = [
    { key: 'contadorC', target: 12103, step: 160 },
    { key: 'contadorD', target: 236, step: 5 },
    { key: 'contadorE', target: 2457, step: 33 },
    { key: 'contadorM', target: 1100, step: 22 },
  ];
  private idx = 0;
  private intervalo: any = null;
  private iniciado = false;

  constructor(
    public _tools: ToolsService,
    private _cd: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    if (this.iniciado) return;
    this.iniciado = true;
    this.intervalo = setInterval(() => this.tick(), 20);
  }

  ngOnDestroy(): void {
    if (this.intervalo) clearInterval(this.intervalo);
  }

  private tick() {
    if (this.idx >= this.secuencia.length) {
      clearInterval(this.intervalo);
      return;
    }
    const item = this.secuencia[this.idx];
    this.contect[item.key] = Math.min(this.contect[item.key] + item.step, item.target);
    if (this.contect[item.key] >= item.target) {
      this.idx++;
    }
    // Resguardo: fuerza que la vista refleje el nuevo valor en cada tick, por si algo en el
    // arbol de componentes padres (menu, tienda, etc.) interfiere con el ciclo normal de
    // deteccion de cambios de Angular. Envuelto en try/catch: si el intervalo llega a disparar
    // una ultima vez justo cuando el componente ya se esta destruyendo (carrera entre
    // clearInterval y un tick ya encolado), detectChanges() sobre una vista destruida lanza
    // error — no rompe nada mas, pero evita ensuciar la consola por una condicion de carrera
    // real y benigna.
    try { this._cd.detectChanges(); } catch { /* vista ya destruida, nada que actualizar */ }
  }

}
