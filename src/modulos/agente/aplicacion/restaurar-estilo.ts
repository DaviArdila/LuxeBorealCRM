import { Inject, Injectable } from '@nestjs/common';
import { REPOSITORIO_ESTILO, type RepositorioEstilo } from '../puertos/repositorio-estilo.js';
import { PublicarEstilo, type ResultadoPublicacion } from './publicar-estilo.js';

/**
 * Restaura una versión del historial (AGT21): publica su texto como una versión **nueva**, sin reescribir el
 * pasado, y lo valida como cualquier estilo (uno viejo que hoy sería inválido se rechaza).
 */
@Injectable()
export class RestaurarEstilo {
  constructor(
    @Inject(REPOSITORIO_ESTILO) private readonly repositorio: RepositorioEstilo,
    private readonly publicar: PublicarEstilo,
  ) {}

  async ejecutar(version: number): Promise<ResultadoPublicacion> {
    const historial = await this.repositorio.leerHistorial();
    const encontrada = historial.find((candidata) => candidata.version === version);
    if (encontrada === undefined) {
      return { publicado: false, motivo: `la versión ${String(version)} no está en el historial` };
    }
    return this.publicar.ejecutar(encontrada.texto);
  }
}
