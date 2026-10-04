/**
 * Arnés de fixtures reales de Chatwoot y firma de prueba (T1 de
 * `openspec/changes/fase-04-canal-chatwoot/tasks.md`, D3 de `design.md`). Solo lo usan tests y el
 * script de captura de fixtures — nunca `src/`: `verificarFirmaChatwoot` (producción) vive en
 * `src/modulos/canales/infraestructura/chatwoot/verificar-firma.ts` (T2) y firma sobre el body
 * crudo real que llega por HTTP, no sobre estos fixtures.
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Carpeta con los payloads reales anonimizados (`test/fixtures/chatwoot/README.md`). */
export const DIRECTORIO_FIXTURES_CHATWOOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'chatwoot',
);

export interface FixtureChatwoot {
  /** Bytes exactos del archivo, para firmar (`firmarComoChatwoot`) o enviar como body de un POST. */
  readonly rawBody: Buffer;
  /** El mismo contenido, ya parseado, para armar aserciones sin volver a parsear el JSON. */
  readonly json: unknown;
}

/**
 * Carga un fixture de `test/fixtures/chatwoot/` por nombre de archivo. Lanza con un mensaje claro
 * si el archivo no existe — un test que carga un nombre inexistente MUST fallar de forma legible,
 * nunca con un `ENOENT` crudo.
 */
export function cargarFixtureChatwoot(nombreArchivo: string): FixtureChatwoot {
  const ruta = join(DIRECTORIO_FIXTURES_CHATWOOT, nombreArchivo);
  let rawBody: Buffer;
  try {
    rawBody = readFileSync(ruta);
  } catch {
    throw new Error(`Fixture de Chatwoot no encontrado: "${nombreArchivo}" (esperado en ${ruta}).`);
  }
  return { rawBody, json: JSON.parse(rawBody.toString('utf8')) };
}

/**
 * Firma un body como lo haría Chatwoot (`X-Chatwoot-Signature: sha256=<hex>`), portado de
 * `../ChatLuxeCRM/src/webhook/verifySignature.ts:firmarComoChatwoot`. Solo para tests/scripts: la
 * verificación real en producción vive en `verificarFirmaChatwoot` (T2), nunca aquí.
 */
export function firmarComoChatwoot(rawBody: Buffer, timestampSegundos: number, secreto: string): string {
  return `sha256=${createHmac('sha256', secreto)
    .update(`${timestampSegundos}.`)
    .update(rawBody)
    .digest('hex')}`;
}
