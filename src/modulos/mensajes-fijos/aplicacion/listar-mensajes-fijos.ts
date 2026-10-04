import { Inject, Injectable } from '@nestjs/common';
import type { DefinicionMensajeFijo } from '../../../compartido/mensajes-fijos/index.js';
import { textoVigente, type MensajeFijo } from '../dominio/mensaje-fijo.js';
import {
  CATALOGO_MENSAJES_FIJOS,
  REPOSITORIO_MENSAJES_FIJOS,
  type RepositorioMensajesFijos,
} from '../puertos/repositorio-mensajes-fijos.js';

/**
 * Lista los mensajes fijos de la lista cerrada con su texto vigente y su origen (CFN1). Una fila de `parametro` con un
 * valor que no es texto o está en blanco cuenta como respaldo, igual que la leen los módulos dueños: lo que ve el
 * admin es lo que el bot enviaría. Ninguna otra clave de `parametro` aparece.
 */
@Injectable()
export class ListarMensajesFijos {
  constructor(
    @Inject(CATALOGO_MENSAJES_FIJOS) private readonly catalogo: readonly DefinicionMensajeFijo[],
    @Inject(REPOSITORIO_MENSAJES_FIJOS) private readonly repositorio: RepositorioMensajesFijos,
  ) {}

  async ejecutar(): Promise<readonly MensajeFijo[]> {
    const filas = await this.repositorio.leer(this.catalogo.map((definicion) => definicion.clave));
    return this.catalogo.map((definicion) => {
      const fila = filas.get(definicion.clave);
      const texto = textoVigente(fila?.valor);
      return texto === null || fila === undefined
        ? { clave: definicion.clave, descripcion: definicion.descripcion, texto: definicion.textoRespaldo, origen: 'respaldo', actualizado: null }
        : { clave: definicion.clave, descripcion: definicion.descripcion, texto, origen: 'base', actualizado: fila.actualizado.toISOString() };
    });
  }
}
