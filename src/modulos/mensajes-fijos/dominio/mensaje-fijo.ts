/** `base` si hay un texto válido en `parametro` (es el que el bot envía); `respaldo` si rige el texto del código (R15). */
export type OrigenMensajeFijo = 'base' | 'respaldo';

/** Un mensaje fijo tal como lo ve el admin (CFN1). `actualizado` es ISO 8601 y solo existe si el origen es `base`. */
export interface MensajeFijo {
  readonly clave: string;
  readonly descripcion: string;
  readonly texto: string;
  readonly origen: OrigenMensajeFijo;
  readonly actualizado: string | null;
}

/** El texto de una fila de `parametro` solo cuenta si es una cadena no vacía: el mismo criterio con que lo leen los módulos dueños. */
export function textoVigente(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim().length > 0 ? valor : null;
}
