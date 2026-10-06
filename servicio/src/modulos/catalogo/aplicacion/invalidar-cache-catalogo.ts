import { Inject, Injectable } from '@nestjs/common';
import { CACHE_CATALOGO, type CacheCatalogo } from '../puertos/cache-catalogo.js';

/**
 * Descarta la copia del catálogo compacto en todos los procesos (CAT5). Lo usa `configuracion` tras guardar un parámetro que
 * el catálogo lee (CFG5); puede lanzar si Redis no responde y quien lo llama decide cómo seguir.
 */
@Injectable()
export class InvalidarCacheCatalogo {
  constructor(@Inject(CACHE_CATALOGO) private readonly cache: CacheCatalogo) {}

  async ejecutar(): Promise<void> {
    await this.cache.invalidar();
  }
}
