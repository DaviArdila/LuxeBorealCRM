import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK } from '../../../plataforma/reloj/index.js';
import type { Clock } from '../../../plataforma/reloj/index.js';
import { leerArchivoDeCasos, planificarSemilla } from '../dominio/semilla.js';
import { REPOSITORIO_SEMILLA, type RepositorioSemilla } from '../puertos/repositorio-semilla.js';
import { VERSION_ASISTENTE, type VersionAsistente } from '../puertos/version-asistente.js';

export interface ResultadoSemilla {
  readonly insertados: number;
  readonly existentes: number;
  /** Con qué texto se planificaron los casos iniciales (CAS13), solo cantidades: nunca el texto (R14). */
  readonly origenesDeTexto?: { readonly casoDelSistema: number; readonly parametro: number; readonly respaldo: number };
}

/**
 * Siembra las categorías «Sistema» y «Políticas» y los casos de hoy (CAS6): los cinco del sistema, con el texto que ya haya
 * en `parametro` o el de respaldo, «Tratamiento de datos» (CAS13) y un caso de intención por cada política existente. Nunca modifica un caso que ya
 * existe, retira de `parametro` las filas que copió en la misma transacción y es idempotente. Informa solo cantidades:
 * ningún texto sale por pantalla ni por logs (R14).
 */
@Injectable()
export class SembrarCasos {
  private readonly logger = new Logger(SembrarCasos.name);

  constructor(
    @Inject(REPOSITORIO_SEMILLA) private readonly repositorio: RepositorioSemilla,
    @Inject(VERSION_ASISTENTE) private readonly version: VersionAsistente,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * `contenidoArchivo` es el JSON ya leído de un archivo de casos de desarrollo (opcional): se valida entero antes de tocar la
   * base y, si es inválido, lanza con el motivo.
   */
  async ejecutar(contenidoArchivo?: unknown): Promise<ResultadoSemilla> {
    const archivo = contenidoArchivo === undefined ? undefined : leerArchivoDeCasos(contenidoArchivo);
    if (archivo !== undefined && !archivo.ok) throw new Error(`el archivo de casos no es válido: ${archivo.motivo}`);
    const plan = planificarSemilla(
      await this.repositorio.leerParametrosDeTexto(),
      archivo,
      await this.repositorio.leerTextoLegadoDelAviso(),
    );
    const insertados = await this.repositorio.aplicar(plan, this.clock.ahora());
    if (insertados > 0) {
      try {
        await this.version.incrementar();
      } catch {
        this.logger.warn({ evento: 'asistente.version-compartida-no-actualizada' });
      }
    }
    const origen = (valor: 'caso-del-sistema' | 'parametro' | 'respaldo') => plan.casos.filter((caso) => caso.origenTexto === valor).length;
    return {
      insertados,
      existentes: plan.casos.length - insertados,
      origenesDeTexto: { casoDelSistema: origen('caso-del-sistema'), parametro: origen('parametro'), respaldo: origen('respaldo') },
    };
  }
}
