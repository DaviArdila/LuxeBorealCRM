import type { Logger } from '@nestjs/common';
import type { VersionAsistente } from '../puertos/version-asistente.js';

/**
 * Sube la versión compartida tras confirmar una escritura (CAS7): si Redis falla, la escritura ya está en la base y la copia en
 * memoria de los demás procesos alcanza con su TTL; el aviso lleva solo el evento, nunca un texto (R14).
 */
export async function subirVersion(version: VersionAsistente, logger: Logger): Promise<void> {
  try {
    await version.incrementar();
  } catch {
    logger.warn({ evento: 'asistente.version-compartida-no-actualizada' });
  }
}
