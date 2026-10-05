import type {
  FilaMensajeFijo,
  RepositorioMensajesFijos,
} from '../../src/modulos/mensajes-fijos/puertos/repositorio-mensajes-fijos.js';

/** Doble de test de {@link RepositorioMensajesFijos}: `parametro` en memoria, con las claves ajenas a la lista a la vista. */
export class RepositorioMensajesFijosEnMemoria implements RepositorioMensajesFijos {
  readonly filas = new Map<string, FilaMensajeFijo>();
  readonly escrituras: string[] = [];

  leer(claves: readonly string[]): Promise<ReadonlyMap<string, FilaMensajeFijo>> {
    return Promise.resolve(new Map([...this.filas].filter(([clave]) => claves.includes(clave))));
  }

  guardar(clave: string, texto: string, ahora: Date): Promise<void> {
    this.escrituras.push(clave);
    this.filas.set(clave, { valor: texto, actualizado: ahora });
    return Promise.resolve();
  }

  insertarFaltantes(mensajes: readonly { clave: string; texto: string }[], ahora: Date): Promise<number> {
    let insertadas = 0;
    for (const { clave, texto } of mensajes) {
      if (this.filas.has(clave)) continue;
      this.filas.set(clave, { valor: texto, actualizado: ahora });
      this.escrituras.push(clave);
      insertadas += 1;
    }
    return Promise.resolve(insertadas);
  }
}
