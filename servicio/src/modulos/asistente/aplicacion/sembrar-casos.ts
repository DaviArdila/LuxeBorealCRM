import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK } from '../../../plataforma/reloj/index.js';
import type { Clock } from '../../../plataforma/reloj/index.js';
import { planificarSemilla } from '../dominio/semilla.js';
import { REPOSITORIO_SEMILLA, type RepositorioSemilla } from '../puertos/repositorio-semilla.js';
import { VERSION_ASISTENTE, type VersionAsistente } from '../puertos/version-asistente.js';

export interface ResultadoSemilla {
  readonly insertados: number;
  readonly existentes: number;
}

/**
 * Siembra las categorías «Sistema» y «Políticas» y los casos de hoy (CAS6): los once del sistema, con el texto que ya haya
 * en `parametro` o el de respaldo, y un caso de intención por cada política existente. Nunca modifica un caso que ya
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

  async ejecutar(): Promise<ResultadoSemilla> {
    const plan = planificarSemilla(await this.repositorio.leerParametrosDeTexto());
    const insertados = await this.repositorio.aplicar(plan, this.clock.ahora());
    if (insertados > 0) {
      try {
        await this.version.incrementar();
      } catch {
        this.logger.warn({ evento: 'asistente.version-compartida-no-actualizada' });
      }
    }
    return { insertados, existentes: plan.casos.length - insertados };
  }
}
