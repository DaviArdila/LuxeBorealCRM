import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK } from '../../../plataforma/reloj/index.js';
import type { Clock } from '../../../plataforma/reloj/index.js';
import { textoDeRespaldo, type ClaveSistema } from '../dominio/sistema.js';
import { REPOSITORIO_CASOS, type RepositorioCasos } from '../puertos/repositorio-casos.js';
import type { TextosAsistente } from '../puertos/textos-asistente.js';
import { VERSION_ASISTENTE, type VersionAsistente } from '../puertos/version-asistente.js';

/**
 * TTL de respaldo (ADR-0020, D3 de la Fase 12): resiliencia técnica, no un dato del negocio (R15 no aplica). Sirve si la
 * versión compartida se pierde sin que nadie haya editado, igual que en `ProveedorEstilo`.
 */
const TTL_RESPALDO_MS = 5 * 60_000;

interface Copia {
  readonly versionCompartida: string;
  readonly expiraEn: number;
  readonly textos: ReadonlyMap<string, string>;
}

/**
 * Entrega el texto de un caso del sistema (CAS7, D3 de la Fase 12): lo lee de `caso_asistente` con el texto del código
 * como respaldo y guarda una copia en memoria mientras la versión compartida de Redis no cambie. Nunca lanza: si la base
 * falla rige el respaldo (sin guardar copia, para reintentar), y si Redis falla no hay copia confiable y se lee la base.
 * Estado de **instancia**, nunca un `let` de módulo; el tiempo sale del `Clock` inyectado. Nunca escribe un texto en
 * logs (R14).
 */
@Injectable()
export class ProveedorTextos implements TextosAsistente {
  private readonly logger = new Logger(ProveedorTextos.name);
  private copia: Copia | null = null;

  constructor(
    @Inject(REPOSITORIO_CASOS) private readonly repositorio: RepositorioCasos,
    @Inject(VERSION_ASISTENTE) private readonly version: VersionAsistente,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async textoDelSistema(clave: ClaveSistema): Promise<string> {
    const guardado = (await this.textos()).get(clave);
    return guardado !== undefined && guardado.trim().length > 0 ? guardado : textoDeRespaldo(clave);
  }

  private async textos(): Promise<ReadonlyMap<string, string>> {
    const versionCompartida = await this.leerVersionCompartida();
    const ahora = this.clock.ahora().getTime();
    if (
      versionCompartida !== null &&
      this.copia !== null &&
      this.copia.versionCompartida === versionCompartida &&
      this.copia.expiraEn > ahora
    ) {
      return this.copia.textos;
    }

    try {
      const textos = await this.repositorio.leerTextosDelSistema();
      this.copia = versionCompartida === null ? null : { versionCompartida, expiraEn: ahora + TTL_RESPALDO_MS, textos };
      return textos;
    } catch {
      this.logger.warn({ evento: 'asistente.textos-base-no-disponible' });
      this.copia = null;
      return new Map();
    }
  }

  /** `null` si Redis no responde: sin versión confiable no se guarda copia. */
  private async leerVersionCompartida(): Promise<string | null> {
    try {
      return await this.version.obtener();
    } catch {
      this.logger.warn({ evento: 'asistente.textos-sin-version-compartida' });
      return null;
    }
  }
}
