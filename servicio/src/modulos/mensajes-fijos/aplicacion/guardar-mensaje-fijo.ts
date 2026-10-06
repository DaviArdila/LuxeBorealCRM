import { Inject, Injectable } from '@nestjs/common';
import type { DefinicionMensajeFijo } from '../../../compartido/mensajes-fijos/index.js';
import { CLOCK, type Clock } from '../../../plataforma/reloj/index.js';
import type { MensajeFijo } from '../dominio/mensaje-fijo.js';
import { validarMensajeFijo } from '../dominio/validar-mensaje-fijo.js';
import {
  CATALOGO_MENSAJES_FIJOS,
  REPOSITORIO_MENSAJES_FIJOS,
  type RepositorioMensajesFijos,
} from '../puertos/repositorio-mensajes-fijos.js';

/** `desconocida`: la clave no está en la lista cerrada (404); `invalido`: el texto incumple CFN2 (422), con su motivo. */
export type ResultadoGuardarMensajeFijo =
  | { readonly guardado: true; readonly mensaje: MensajeFijo }
  | { readonly guardado: false; readonly razon: 'desconocida' }
  | { readonly guardado: false; readonly razon: 'invalido'; readonly motivo: string };

/**
 * Guarda el texto de un mensaje fijo (CFN2). Una clave fuera de la lista no escribe nada. El texto se guarda sin los
 * espacios y saltos de línea de los bordes (un editor deja un salto final que el cliente vería como una línea en blanco)
 * y se valida ya recortado. Rige desde el siguiente mensaje: guardar sube la versión compartida de `asistente` y el puerto de textos relee.
 */
@Injectable()
export class GuardarMensajeFijo {
  constructor(
    @Inject(CATALOGO_MENSAJES_FIJOS) private readonly catalogo: readonly DefinicionMensajeFijo[],
    @Inject(REPOSITORIO_MENSAJES_FIJOS) private readonly repositorio: RepositorioMensajesFijos,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async ejecutar(clave: string, texto: string): Promise<ResultadoGuardarMensajeFijo> {
    const definicion = this.catalogo.find((candidata) => candidata.clave === clave);
    if (definicion === undefined) {
      return { guardado: false, razon: 'desconocida' };
    }
    const recortado = texto.trim();
    const validacion = validarMensajeFijo(recortado);
    if (!validacion.valido) {
      return { guardado: false, razon: 'invalido', motivo: validacion.motivo };
    }
    const ahora = this.clock.ahora();
    await this.repositorio.guardar(clave, recortado, ahora);
    return {
      guardado: true,
      mensaje: {
        clave,
        descripcion: definicion.descripcion,
        texto: recortado,
        origen: 'base',
        actualizado: ahora.toISOString(),
      },
    };
  }
}
