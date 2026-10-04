import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK } from '../../../plataforma/reloj/index.js';
import type { Clock } from '../../../plataforma/reloj/index.js';
import { CargadorPrompts } from '../infraestructura/prompts/cargador-prompts.js';
import { REPOSITORIO_ESTILO, type RepositorioEstilo } from '../puertos/repositorio-estilo.js';
import { VERSION_ESTILO, type VersionEstilo } from '../puertos/version-estilo.js';

/**
 * TTL de respaldo (ADR-0020): resiliencia técnica, no un dato del negocio (R15 no aplica). Sirve si la versión
 * compartida se pierde sin que nadie haya publicado, igual que en `CacheCatalogoRedis`.
 */
const TTL_RESPALDO_MS = 5 * 60_000;

/** El estilo con el que se arma el prompt de un turno y de dónde salió (para el log, sin su contenido). */
export interface EstiloVigente {
  readonly texto: string;
  /** `0` cuando rige el archivo de respaldo. */
  readonly version: number;
  readonly origen: 'base' | 'archivo';
}

interface Copia {
  readonly versionCompartida: string;
  readonly expiraEn: number;
  readonly estilo: EstiloVigente;
}

/**
 * Entrega el estilo del agente (AGT18, AGT19, D3 de la Fase 08c): lo lee de `parametro` con el archivo versionado
 * como respaldo y guarda una copia en memoria mientras la versión compartida de Redis no cambie. Nunca lanza: si
 * la base falla rige el archivo, y si Redis falla no hay copia confiable y se lee la base (el turno sigue). Estado
 * de **instancia**, nunca un `let` de módulo; el tiempo sale del `Clock` inyectado.
 */
@Injectable()
export class ProveedorEstilo {
  private readonly logger = new Logger(ProveedorEstilo.name);
  private copia: Copia | null = null;

  constructor(
    @Inject(REPOSITORIO_ESTILO) private readonly repositorio: RepositorioEstilo,
    @Inject(VERSION_ESTILO) private readonly version: VersionEstilo,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly cargador: CargadorPrompts,
  ) {}

  async obtener(): Promise<EstiloVigente> {
    const versionCompartida = await this.leerVersionCompartida();
    const ahora = this.clock.ahora().getTime();
    if (
      versionCompartida !== null &&
      this.copia !== null &&
      this.copia.versionCompartida === versionCompartida &&
      this.copia.expiraEn > ahora
    ) {
      return this.copia.estilo;
    }

    const estilo = await this.leerDeLaBase();
    this.copia = versionCompartida === null ? null : { versionCompartida, expiraEn: ahora + TTL_RESPALDO_MS, estilo };
    return estilo;
  }

  /** `null` si Redis no responde: sin versión confiable no se guarda copia. */
  private async leerVersionCompartida(): Promise<string | null> {
    try {
      return await this.version.obtener();
    } catch {
      this.logger.warn({ evento: 'agente.estilo-sin-version-compartida' });
      return null;
    }
  }

  private async leerDeLaBase(): Promise<EstiloVigente> {
    try {
      const guardado = await this.repositorio.leerVigente();
      if (guardado !== null && guardado.texto.trim().length > 0) {
        return { texto: guardado.texto, version: guardado.version, origen: 'base' };
      }
    } catch {
      this.logger.warn({ evento: 'agente.estilo-base-no-disponible' });
    }
    return { texto: this.cargador.estilo, version: 0, origen: 'archivo' };
  }
}
