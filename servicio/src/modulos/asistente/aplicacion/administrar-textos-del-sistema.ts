import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK } from '../../../plataforma/reloj/index.js';
import type { Clock } from '../../../plataforma/reloj/index.js';
import type { ClaveSistema } from '../dominio/sistema.js';
import { REPOSITORIO_CASOS, type CasoDelSistema, type RepositorioCasos } from '../puertos/repositorio-casos.js';
import { VERSION_ASISTENTE, type VersionAsistente } from '../puertos/version-asistente.js';

/**
 * Lee y escribe el texto de los casos del sistema para quien lo administra (hoy el adaptador de `mensajes-fijos`; la API de
 * casos de T7 reemplaza este uso). Toda escritura sube la versión compartida para que el siguiente mensaje del bot use el texto
 * nuevo (CAS7); si Redis falla después de confirmar la base, el texto ya está guardado y la copia en memoria alcanza a los
 * demás procesos con su TTL. Nunca escribe un texto en logs (R14).
 */
@Injectable()
export class AdministrarTextosDelSistema {
  private readonly logger = new Logger(AdministrarTextosDelSistema.name);

  constructor(
    @Inject(REPOSITORIO_CASOS) private readonly repositorio: RepositorioCasos,
    @Inject(VERSION_ASISTENTE) private readonly version: VersionAsistente,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  leer(): Promise<ReadonlyMap<string, CasoDelSistema>> {
    return this.repositorio.leerCasosDelSistema();
  }

  async guardar(clave: ClaveSistema, texto: string): Promise<void> {
    await this.repositorio.guardarTextoDelSistema(clave, texto, this.clock.ahora());
    await this.subirVersion();
  }

  /** Crea los casos que falten con el texto dado (el de respaldo) y devuelve cuántos creó; no pisa ninguno. */
  async crearFaltantes(textos: readonly { readonly clave: ClaveSistema; readonly texto: string }[]): Promise<number> {
    let creados = 0;
    for (const { clave, texto } of textos) {
      if (await this.repositorio.crearTextoDelSistemaSiFalta(clave, texto, this.clock.ahora())) creados += 1;
    }
    if (creados > 0) await this.subirVersion();
    return creados;
  }

  private async subirVersion(): Promise<void> {
    try {
      await this.version.incrementar();
    } catch {
      this.logger.warn({ evento: 'asistente.version-compartida-no-actualizada' });
    }
  }
}
