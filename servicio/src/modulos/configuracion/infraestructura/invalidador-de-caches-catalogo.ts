import { Injectable } from '@nestjs/common';
import { InvalidarCacheCatalogo } from '../../catalogo/index.js';
import type { InvalidadorDeCaches } from '../puertos/invalidador-caches.js';

/** Adaptador de {@link InvalidadorDeCaches}: la caché del catálogo es de `catalogo`, que expone cómo descartarla. */
@Injectable()
export class InvalidadorDeCachesCatalogo implements InvalidadorDeCaches {
  constructor(private readonly catalogo: InvalidarCacheCatalogo) {}

  invalidarCatalogo(): Promise<void> {
    return this.catalogo.ejecutar();
  }
}
