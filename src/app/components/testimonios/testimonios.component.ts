import { Component, OnInit } from '@angular/core';
import { environment } from 'src/environments/environment';
import { TestimoniosService } from 'src/app/servicesComponents/testimonios.service';
import { NgxSpinnerService } from 'ngx-spinner';
import { SeoService } from 'src/app/services/seo.service';


const URLFRON = environment.urlFront;

@Component({
  selector: 'app-testimonios',
  templateUrl: './testimonios.component.html',
  styleUrls: ['./testimonios.component.scss']
})
export class TestimoniosComponent implements OnInit {

  listRow:any = [];
  urlRegistro:string = `${ URLFRON }/registro/`;
  query:any = {
    where:{
      estado: 0
    },
    page: 0,
    limit: 15
  };
  dataUser:any = {};

  constructor(
    private _testimonios: TestimoniosService,
    private spinner: NgxSpinnerService,
    private _seo: SeoService,
  ) {
  }

  ngOnInit(): void {
    this._seo.update({
      title: 'Testimonios: Casos de Éxito Vendiendo por Internet | LokomproAqui',
      description: 'Historias reales de personas que generan ingresos vendiendo por internet con dropshipping en LokomproAqui, sin invertir en inventario.',
      keywords: 'testimonios dropshipping, casos de exito ventas por internet',
      path: '/testimonio',
    });
    this.getRow();
  }

  getRow(){
    this.spinner.show();
    this._testimonios.get( this.query ).subscribe(( res:any )=>{
      this.listRow = res.data;
      this.spinner.hide();
    });
  }

}
