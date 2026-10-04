import { Inject, Injectable } from '@nestjs/common';
import type { DefinicionMensajeFijo } from '../../../compartido/mensajes-fijos/index.js';
import { CLOCK, type Clock } from '../../../plataforma/reloj/index.js';
import {
  CATALOGO_MENSAJES_FIJOS,
  REPOSITORIO_MENSAJES_FIJOS,
  type RepositorioMensajesFijos,
} from '../puertos/repositorio-mensajes-fijos.js';

export interface ResultadoSemilla {
  readonly insertadas: number;
  readonly existentes: number;
}

/**
 * Inserta en `parametro` los mensajes de la lista que no tienen fila, con su texto de respaldo (CFN3, D5): así el dueño
 * ve y edita todos desde el primer día. Nunca modifica una fila existente, aunque difiera del respaldo, y correrla de
 * nuevo no cambia nada. Informa cuántas insertó y cuántas ya existían, sin los textos.
 */
@Injectable()
export class SembrarMensajesFijos {
  constructor(
    @Inject(CATALOGO_MENSAJES_FIJOS) private readonly catalogo: readonly DefinicionMensajeFijo[],
    @Inject(REPOSITORIO_MENSAJES_FIJOS) private readonly repositorio: RepositorioMensajesFijos,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async ejecutar(): Promise<ResultadoSemilla> {
    const insertadas = await this.repositorio.insertarFaltantes(
      this.catalogo.map(({ clave, textoRespaldo }) => ({ clave, texto: textoRespaldo })),
      this.clock.ahora(),
    );
    return { insertadas, existentes: this.catalogo.length - insertadas };
  }
}
