import type { OpenAPIObject } from '@nestjs/swagger';

const ORDEN_PRIMER_NIVEL = ['openapi', 'info', 'servers', 'tags', 'paths', 'components'];

function compararClaves(izquierda: string, derecha: string): number {
  if (izquierda < derecha) {
    return -1;
  }
  if (izquierda > derecha) {
    return 1;
  }
  return 0;
}

function ordenarValor(valor: unknown, esRaiz = false): unknown {
  if (Array.isArray(valor)) {
    return valor.map((elemento) => ordenarValor(elemento));
  }
  if (typeof valor !== 'object' || valor === null) {
    return valor;
  }

  const entradas = Object.entries(valor);
  entradas.sort(([claveA], [claveB]) => {
    if (esRaiz) {
      const indiceA = ORDEN_PRIMER_NIVEL.indexOf(claveA);
      const indiceB = ORDEN_PRIMER_NIVEL.indexOf(claveB);
      if (indiceA !== -1 || indiceB !== -1) {
        if (indiceA === -1) {
          return 1;
        }
        if (indiceB === -1) {
          return -1;
        }
        return indiceA - indiceB;
      }
    }
    return compararClaves(claveA, claveB);
  });

  return Object.fromEntries(
    entradas.map(([clave, contenido]) => [clave, ordenarValor(contenido)]),
  );
}

/** Orden de primer nivel fijo y claves anidadas alfabéticas; conserva el orden de todos los arrays. */
export function ordenarDocumento(documento: OpenAPIObject): OpenAPIObject {
  return ordenarValor(documento, true) as OpenAPIObject;
}
