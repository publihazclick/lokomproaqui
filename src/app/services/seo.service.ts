import { Injectable, Inject } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';

export interface SeoConfig {
  title: string;
  description: string;
  /** Ruta relativa (ej. "/acelerador"). Se arma la URL canonica/og:url completa con SITE_URL. */
  path?: string;
  image?: string;
  type?: string;
  keywords?: string;
  noIndex?: boolean;
}

const SITE_URL = 'https://www.lokomproaqui.com';
const DEFAULT_IMAGE = `${SITE_URL}/assets/logo.jpeg`;

// Centraliza title/description/OG/Twitter/canonical/JSON-LD por pagina: la app es un SPA sin
// SSR, asi que esto es lo unico que le da a cada ruta publica sus propios tags (antes todas
// las paginas compartian el <title> y meta description estaticos de index.html).
@Injectable({
  providedIn: 'root'
})
export class SeoService {

  constructor(
    private titleService: Title,
    private meta: Meta,
    @Inject(DOCUMENT) private document: Document,
  ) { }

  update(config: SeoConfig): void {
    const url = `${SITE_URL}${config.path || ''}`;
    const image = config.image || DEFAULT_IMAGE;
    const type = config.type || 'website';

    this.titleService.setTitle(config.title);

    this.meta.updateTag({ name: 'description', content: config.description });
    if (config.keywords) {
      this.meta.updateTag({ name: 'keywords', content: config.keywords });
    }
    this.meta.updateTag({ name: 'robots', content: config.noIndex ? 'noindex, follow' : 'index, follow' });

    this.meta.updateTag({ property: 'og:title', content: config.title });
    this.meta.updateTag({ property: 'og:description', content: config.description });
    this.meta.updateTag({ property: 'og:image', content: image });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:type', content: type });
    this.meta.updateTag({ property: 'og:site_name', content: 'LokomproAqui' });

    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: config.title });
    this.meta.updateTag({ name: 'twitter:description', content: config.description });
    this.meta.updateTag({ name: 'twitter:image', content: image });

    this.setCanonical(url);
  }

  private setCanonical(url: string): void {
    let link: HTMLLinkElement = this.document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }
    link.setAttribute('href', url);
  }

  /** Inyecta/actualiza un bloque JSON-LD identificado por id (para no duplicar al navegar). */
  setJsonLd(id: string, data: object): void {
    let script: HTMLScriptElement = this.document.querySelector(`script[type="application/ld+json"]#${id}`);
    if (!script) {
      script = this.document.createElement('script');
      script.type = 'application/ld+json';
      script.id = id;
      this.document.head.appendChild(script);
    }
    script.text = JSON.stringify(data);
  }

  removeJsonLd(id: string): void {
    const script = this.document.querySelector(`script[type="application/ld+json"]#${id}`);
    if (script) script.remove();
  }
}
