import type { PosicionCursor } from './administracion.js';

/**
 * Cursor opaco del listado de casos (API5, CAS10): codifica `(orden de categoría, título normalizado, id)` en base64url.
 * Quien llama no debe interpretarlo; un cursor que no se pueda leer se rechaza (`decodificarCursor` devuelve `null`).
 */
export function codificarCursor(posicion: PosicionCursor): string {
  return Buffer.from(JSON.stringify([posicion.ordenCategoria, posicion.tituloNormalizado, posicion.id]), 'utf8').toString('base64url');
}

export function decodificarCursor(cursor: string): PosicionCursor | null {
  try {
    const valor: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!Array.isArray(valor) || valor.length !== 3) return null;
    const [ordenCategoria, tituloNormalizado, id] = valor as unknown[];
    if (typeof ordenCategoria !== 'number' || !Number.isInteger(ordenCategoria)) return null;
    if (typeof tituloNormalizado !== 'string' || typeof id !== 'string') return null;
    return { ordenCategoria, tituloNormalizado, id };
  } catch {
    return null;
  }
}
