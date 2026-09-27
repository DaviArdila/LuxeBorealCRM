import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { CONFIGURACION } from '../../../plataforma/config/index.js';
import type { Configuracion } from '../../../plataforma/config/index.js';
import type { ColaEventosEntrantes } from '../puertos/cola-eventos-entrantes.js';

/** Nombre de la cola del inbox de `canales` (D6, D7 de `design.md`). */
export const NOMBRE_COLA_INBOX = 'canales-inbox';

/** Nombre del job normal de procesamiento (distinto del job de barrido, D7). */
export const NOMBRE_JOB_PROCESAR = 'procesar-evento-entrante';

/**
 * Adaptador BullMQ del puerto {@link ColaEventosEntrantes} (D6, D7): sustituye a
 * `ColaEventosEntrantesDoble` de T3. `jobId = id` (D5) hace que un segundo `encolar` con el mismo
 * id sea un no-op para BullMQ (mismo evento reintentado por el proveedor, R4): nunca produce un
 * segundo job. `removeOnComplete`/`removeOnFail`: Postgres (`evento_entrante`) es la verdad (D5);
 * el job de BullMQ solo dispara el procesamiento, así que no hace falta conservarlo en Redis una
 * vez que termina, en éxito o en fallo agotado.
 */
@Injectable()
export class ColaEventosEntrantesBullmq implements ColaEventosEntrantes {
  private readonly logger = new Logger(ColaEventosEntrantesBullmq.name);

  constructor(
    @InjectQueue(NOMBRE_COLA_INBOX) private readonly cola: Queue,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
  ) {
    // D6: toda Queue tiene un listener de 'error', sin él un Redis inaccesible se convierte en una
    // excepción no capturada. Nunca loguea PII: el error de conexión no lleva contenido de cliente.
    this.cola.on('error', (error) => {
      this.logger.warn(`Cola ${NOMBRE_COLA_INBOX} emitió un error: ${error.constructor.name}`);
    });
  }

  async encolar(id: string): Promise<void> {
    await this.cola.add(NOMBRE_JOB_PROCESAR, id, {
      jobId: id,
      attempts: this.configuracion.INBOX_MAX_INTENTOS,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: true,
    });
  }
}
