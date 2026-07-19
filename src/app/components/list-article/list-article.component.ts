import { Component, OnInit } from '@angular/core';
import { SeoService } from 'src/app/services/seo.service';

@Component({
  selector: 'app-list-article',
  templateUrl: './list-article.component.html',
  styleUrls: ['./list-article.component.scss']
})
export class ListArticleComponent implements OnInit {

  constructor(private _seo: SeoService) { }

  ngOnInit(): void {
    this._seo.update({
      title: 'Catálogo de Productos para Vender por Internet | LokomproAqui',
      description: 'Explora el catálogo dropshipping de LokomproAqui: miles de productos listos para vender por internet, sin invertir en inventario y con envío contra entrega.',
      keywords: 'catalogo dropshipping, productos para vender por internet, productos dropshipping colombia',
      path: '/listproduct',
    });
  }

}
