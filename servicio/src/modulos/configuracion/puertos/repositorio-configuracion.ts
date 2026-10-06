/** Token de inyección del puerto {@link RepositorioConfiguracion}. */
export const REPOSITORIO_CONFIGURACION = Symbol('REPOSITORIO_CONFIGURACION');

export interface ParametroGuardado {
  readonly valor: unknown;
  readonly actualizado: Date;
}

/** Un día cerrado por excepción (festivo, cierre especial): `fecha` es `AAAA-MM-DD`. */
export interface ExcepcionDeHorario {
  readonly fecha: string;
  readonly motivo: string | null;
}

/** CFG6: se intentó escribir una clave que no está en el registro tipado. */
export class ClaveFueraDelRegistro extends Error {
  constructor(readonly clave: string) {
    super(`La clave «${clave}» no está en el registro de configuración`);
    this.name = 'ClaveFueraDelRegistro';
  }
}

/** Lectura y escritura de `parametro` y `excepcion_horario` para los grupos de configuración (CFG1-CFG6). */
export interface RepositorioConfiguracion {
  /** El valor crudo guardado y su fecha, o `null` si la clave no tiene fila. Solo claves del registro. */
  leerParametro(clave: string): Promise<ParametroGuardado | null>;
  /**
   * Guarda las claves de una sola vez (todo o nada). Lanza {@link ClaveFueraDelRegistro}, sin escribir nada, si alguna no
   * está en el registro o su valor no tiene el tipo de su clave (CFG6). `ahora` es del `Clock`.
   */
  guardarParametros(entradas: readonly { readonly clave: string; readonly valor: unknown }[], ahora: Date): Promise<void>;
  listarExcepciones(): Promise<readonly ExcepcionDeHorario[]>;
  /** Crea la excepción y devuelve `false` si ya había una para esa fecha. */
  crearExcepcion(fecha: string, motivo: string | null): Promise<boolean>;
  /** Borra la excepción y devuelve `false` si no existía. */
  borrarExcepcion(fecha: string): Promise<boolean>;
}
