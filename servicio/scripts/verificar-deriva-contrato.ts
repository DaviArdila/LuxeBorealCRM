import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { construirDocumentosContrato } from './generar-contrato.js';
import { resolverRaizRepositorio } from './herramientas.js';
import type { ResultadoContrato } from './generar-contrato.js';

function normalizarSaltosDeLinea(texto: string): string {
  return texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function primeraLineaDiferente(generado: string, guardado: string): number {
  const lineasGeneradas = generado.split(/\r\n|\n|\r/);
  const lineasGuardadas = guardado.split(/\r\n|\n|\r/);
  const cantidad = Math.max(lineasGeneradas.length, lineasGuardadas.length);

  for (let indice = 0; indice < cantidad; indice += 1) {
    if (lineasGeneradas[indice] !== lineasGuardadas[indice]) {
      return indice + 1;
    }
  }
  return 1;
}

export interface ResultadoComparacionContrato {
  readonly limpio: boolean;
  readonly mensaje: string;
}

/** Compara los bytes generados con los versionados y explica la primera diferencia. */
export function compararContenidoContrato(
  archivo: string,
  generado: string,
  guardado: Uint8Array,
): ResultadoComparacionContrato {
  const bytesGenerados = Buffer.from(generado, 'utf8');
  const bytesGuardados = Buffer.from(guardado);
  if (Buffer.compare(bytesGenerados, bytesGuardados) === 0) {
    return { limpio: true, mensaje: `contrato:deriva: ${archivo} coincide byte a byte.` };
  }

  const textoGuardado = bytesGuardados.toString('utf8');
  if (normalizarSaltosDeLinea(generado) === normalizarSaltosDeLinea(textoGuardado)) {
    return {
      limpio: false,
      mensaje:
        `contrato:deriva: ${archivo} difiere solo en fin de línea. Revisa .gitattributes y, ` +
        'si acabas de corregirlo, ejecuta "git add --renormalize .".',
    };
  }

  const linea = primeraLineaDiferente(generado, textoGuardado);
  return {
    limpio: false,
    mensaje:
      `contrato:deriva: ${archivo} difiere desde la línea ${linea}. ` +
      'Ejecuta "npm run contrato:generar" y revisa el cambio.',
  };
}

async function compararArchivo(
  raiz: string,
  archivo: string,
  generado: string,
): Promise<ResultadoComparacionContrato> {
  try {
    const guardado = await readFile(path.join(raiz, archivo));
    return compararContenidoContrato(archivo, generado, guardado);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return {
        limpio: false,
        mensaje: `contrato:deriva: falta ${archivo}; ejecuta "npm run contrato:generar".`,
      };
    }
    return {
      limpio: false,
      mensaje: `contrato:deriva: no se pudo leer ${archivo}: ${(error as Error).message}`,
    };
  }
}

/** Regenera en memoria y compara ambos archivos sin escribirlos. */
export async function verificarDerivaContrato(): Promise<ResultadoContrato> {
  try {
    const raiz = resolverRaizRepositorio();
    const documentos = await construirDocumentosContrato();
    const resultados = await Promise.all([
      compararArchivo(raiz, 'openapi/openapi.interno.json', documentos.interno),
      compararArchivo(raiz, 'openapi/openapi.json', documentos.publico),
    ]);

    return {
      limpio: resultados.every(({ limpio }) => limpio),
      mensaje: resultados.map(({ mensaje }) => mensaje).join('\n'),
    };
  } catch (error) {
    return {
      limpio: false,
      mensaje: `contrato:deriva: no se pudo regenerar el contrato en memoria: ${(error as Error).message}`,
    };
  }
}
