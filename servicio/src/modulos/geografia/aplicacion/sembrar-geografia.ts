import { Inject, Injectable } from '@nestjs/common';
import { interpretarDivipola } from '../dominio/interpretar-divipola.js';
import { REPOSITORIO_GEOGRAFIA } from '../puertos/repositorio-geografia.js';
import type {
  RepositorioGeografia,
  ResumenGuardado,
} from '../puertos/repositorio-geografia.js';

/**
 * Caso de uso de la semilla DANE (design.md D8): interpreta el texto fuente DIVIPOLA y lo guarda
 * a través del puerto {@link RepositorioGeografia}. Si `interpretarDivipola` lanza
 * `FuenteDivipolaInvalida`, no se llama a `guardarCatalogo` — no se escribe nada (PER11, PER12).
 */
@Injectable()
export class SembrarGeografia {
  constructor(
    @Inject(REPOSITORIO_GEOGRAFIA) private readonly repositorio: RepositorioGeografia,
  ) {}

  async ejecutar(textoFuente: string): Promise<ResumenGuardado> {
    const catalogo = interpretarDivipola(textoFuente);
    return this.repositorio.guardarCatalogo(catalogo);
  }
}
