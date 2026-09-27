/**
 * Verificación de firma HMAC de los webhooks del Agent Bot de Chatwoot (D3, R3, CAN2), portada de
 * `../ChatLuxeCRM/src/webhook/verifySignature.ts`. `ahoraSegundos` es obligatorio: lo aporta el
 * `CLOCK` inyectado en la guardia (T3), nunca `Date.now()` (PLT2). Vive en `infraestructura/` y no
 * en `dominio/` porque usa `node:crypto` (regla `dominio-aislado`, D1).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface ParametrosVerificarFirmaChatwoot {
  readonly rawBody: Buffer;
  readonly firmaHeader: string | undefined;
  readonly timestampHeader: string | undefined;
  readonly secreto: string;
  readonly toleranciaSegundos: number;
  readonly ahoraSegundos: number;
}

const PREFIJO_FIRMA = 'sha256=';

/**
 * `false` en cualquier caso ambiguo o inválido (falla cerrada, D3): cabecera de firma o de
 * timestamp faltante, prefijo distinto de `sha256=`, timestamp no numérico o fuera de
 * `toleranciaSegundos` (anti-replay), longitud de firma distinta de la esperada, o **secreto
 * vacío** — un despliegue sin secreto configurado rechaza todo, nunca acepta todo.
 */
export function verificarFirmaChatwoot(parametros: ParametrosVerificarFirmaChatwoot): boolean {
  const { rawBody, firmaHeader, timestampHeader, secreto, toleranciaSegundos, ahoraSegundos } = parametros;

  if (!secreto || !firmaHeader || !firmaHeader.startsWith(PREFIJO_FIRMA) || !timestampHeader) {
    return false;
  }

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(ahoraSegundos - timestamp) > toleranciaSegundos) return false;

  const firmaRecibida = Buffer.from(firmaHeader.slice(PREFIJO_FIRMA.length), 'hex');
  const firmaEsperada = Buffer.from(
    createHmac('sha256', secreto).update(`${timestampHeader}.`).update(rawBody).digest('hex'),
    'hex',
  );
  if (firmaRecibida.length !== firmaEsperada.length || firmaRecibida.length === 0) return false;

  return timingSafeEqual(firmaRecibida, firmaEsperada);
}
