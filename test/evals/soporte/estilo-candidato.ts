import { readFile } from 'node:fs/promises';
import type { INestApplicationContext } from '@nestjs/common';
import { PublicarEstilo } from '../../../src/modulos/agente/index.js';

/**
 * Estilo candidato para las evals (Fase 08c, T6, ADR-0020): `EVALS_ESTILO=<ruta>` publica ese archivo en la base
 * **de la corrida** (la de prueba, nunca la de producción) antes de correr los casos, para medir un estilo nuevo
 * con el LLM real (EVL3) antes de publicarlo con `npm run prompt:estilo`. Devuelve `undefined` si no se pidió.
 */
export function leerEstiloCandidato(entorno: Readonly<Record<string, string | undefined>>): string | undefined {
  const ruta = entorno['EVALS_ESTILO']?.trim();
  return ruta === undefined || ruta.length === 0 ? undefined : ruta;
}

/**
 * Publica el estilo candidato por el mismo caso de uso que usa el comando (valida, historial, versión), así la
 * corrida lo usa igual que el bot real. Un archivo ilegible o un estilo inválido detiene la corrida con un
 * mensaje que nombra la ruta o el motivo, nunca el texto (R14).
 */
export async function aplicarEstiloCandidato(
  app: INestApplicationContext,
  ruta: string | undefined,
): Promise<{ readonly version: number } | null> {
  if (ruta === undefined) {
    return null;
  }
  let texto: string;
  try {
    texto = await readFile(ruta, 'utf8');
  } catch {
    throw new Error(`EVALS_ESTILO: no se pudo leer el archivo "${ruta}".`);
  }
  const resultado = await app.get(PublicarEstilo, { strict: false }).ejecutar(texto);
  if (!resultado.publicado) {
    throw new Error(`EVALS_ESTILO: el estilo candidato no es válido: ${resultado.motivo}.`);
  }
  return { version: resultado.version };
}
