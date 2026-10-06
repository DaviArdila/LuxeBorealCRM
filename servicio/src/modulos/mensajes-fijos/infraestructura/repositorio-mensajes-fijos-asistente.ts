import { Injectable } from '@nestjs/common';
import { AdministrarTextosDelSistema, esClaveDelSistema } from '../../asistente/index.js';
import type { FilaMensajeFijo, RepositorioMensajesFijos } from '../puertos/repositorio-mensajes-fijos.js';

/**
 * Adaptador de {@link RepositorioMensajesFijos} sobre `asistente` (T5 de la Fase 12): un mensaje fijo es el caso del sistema
 * con esa clave. La pantalla «Mensajes fijos» sigue editando lo que el bot lee (el puerto de textos) hasta que T8 la
 * reemplace por «Casos de uso». Toda escritura sube la versión compartida de `asistente`, así rige desde el siguiente mensaje; la hora de escritura sale del
 * `Clock` de `asistente` (el mismo del módulo), por eso los métodos no usan el instante que reciben.
 */
@Injectable()
export class RepositorioMensajesFijosAsistente implements RepositorioMensajesFijos {
  constructor(private readonly textos: AdministrarTextosDelSistema) {}

  async leer(claves: readonly string[]): Promise<ReadonlyMap<string, FilaMensajeFijo>> {
    const casos = await this.textos.leer();
    return new Map(
      claves.flatMap((clave) => {
        const caso = casos.get(clave);
        return caso === undefined ? [] : [[clave, { valor: caso.texto, actualizado: caso.actualizado }] as const];
      }),
    );
  }

  async guardar(clave: string, texto: string): Promise<void> {
    if (!esClaveDelSistema(clave)) throw new Error(`la clave ${clave} no es un caso del sistema`);
    await this.textos.guardar(clave, texto);
  }

  async insertarFaltantes(mensajes: readonly { clave: string; texto: string }[]): Promise<number> {
    return this.textos.crearFaltantes(mensajes.flatMap(({ clave, texto }) => (esClaveDelSistema(clave) ? [{ clave, texto }] : [])));
  }
}
