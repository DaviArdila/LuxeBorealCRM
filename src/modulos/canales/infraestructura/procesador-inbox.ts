import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  Inject,
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { CONFIGURACION } from '../../../plataforma/config/index.js';
import type { Configuracion } from '../../../plataforma/config/index.js';
import { CLOCK } from '../../../plataforma/reloj/index.js';
import type { Clock } from '../../../plataforma/reloj/index.js';
import { ProcesarEventoEntrante } from '../aplicacion/procesar-evento-entrante.js';
import { COLA_EVENTOS_ENTRANTES, type ColaEventosEntrantes } from '../puertos/cola-eventos-entrantes.js';
import {
  REPOSITORIO_EVENTO_ENTRANTE,
  type RepositorioEventoEntrante,
} from '../puertos/repositorio-evento-entrante.js';
import { NOMBRE_COLA_INBOX } from './cola-eventos-entrantes-bullmq.js';

/** Nombre del job repetible de barrido, distinto del job normal de procesamiento (D7). */
const NOMBRE_JOB_BARRIDO = 'barrido-inbox';

/** Id del `JobScheduler` de BullMQ que dispara el barrido (D7); estable entre reinicios. */
const ID_SCHEDULER_BARRIDO = 'barrido-inbox';

/** Tope defensivo de filas por vuelta de barrido (D7); no es un ajuste fino de rendimiento. */
const MAXIMO_BARRIDO = 100;

/**
 * Procesador real del inbox (D6, D7 de `design.md`): `WorkerHost` de BullMQ sobre la cola
 * {@link NOMBRE_COLA_INBOX} (concurrencia 1, `autorun: false`). Delega la lógica de negocio en
 * {@link ProcesarEventoEntrante} (D7, D8) — esta clase solo conoce BullMQ: decide `esUltimoIntento`
 * a partir del `Job` real (`job.attemptsMade + 1 >= attempts`) y atiende el job repetible de
 * barrido, que reencola (vía el puerto {@link ColaEventosEntrantes}, con el mismo `jobId = id` de
 * D5) las filas que quedaron pendientes más de `INBOX_BARRIDO_MS` sin marca de error — cubre un
 * Redis caído durante el ACK del webhook (D5) o un proceso caído con el job en memoria (invariante
 * de D7: ningún evento aceptado se pierde).
 *
 * El worker solo arranca (`worker.run()`) y solo registra el barrido cuando `COLAS_TRABAJADORES` es
 * `true` (D6): los contextos que generan el contrato OpenAPI no tienen Redis real y necesitan que
 * `AppModule` compile sin intentar consumir nada.
 */
@Injectable()
@Processor(NOMBRE_COLA_INBOX, { concurrency: 1, autorun: false })
export class ProcesadorInbox
  extends WorkerHost
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private readonly logger = new Logger(ProcesadorInbox.name);

  constructor(
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
    @Inject(REPOSITORIO_EVENTO_ENTRANTE) private readonly repositorio: RepositorioEventoEntrante,
    @Inject(COLA_EVENTOS_ENTRANTES) private readonly cola: ColaEventosEntrantes,
    @Inject(CLOCK) private readonly clock: Clock,
    @InjectQueue(NOMBRE_COLA_INBOX) private readonly colaBullmq: Queue,
    private readonly procesarEventoEntrante: ProcesarEventoEntrante,
  ) {
    super();
  }

  async process(job: Job<string>): Promise<void> {
    if (job.name === NOMBRE_JOB_BARRIDO) {
      await this.ejecutarBarrido();
      return;
    }

    const intentosMaximos = job.opts.attempts ?? 1;
    const esUltimoIntento = job.attemptsMade + 1 >= intentosMaximos;
    await this.procesarEventoEntrante.ejecutar(job.data, esUltimoIntento);
  }

  private async ejecutarBarrido(): Promise<void> {
    const limite = new Date(this.clock.ahora().getTime() - this.configuracion.INBOX_BARRIDO_MS);
    const pendientes = await this.repositorio.listarPendientesAntesDe(limite, MAXIMO_BARRIDO);
    for (const id of pendientes) {
      await this.cola.encolar(id);
    }
  }

  /** D6: todo Worker tiene un listener de 'error'; sin él, Node lo convierte en excepción no capturada. */
  @OnWorkerEvent('error')
  manejarErrorDelWorker(error: Error): void {
    this.logger.warn(`Worker de ${NOMBRE_COLA_INBOX} emitió un error: ${error.constructor.name}`);
  }

  onApplicationBootstrap(): void {
    if (!this.configuracion.COLAS_TRABAJADORES) {
      return;
    }

    // `worker.run()` no se espera (D6): el arranque de la app no depende de que el worker esté
    // consumiendo; un fallo se loguea, nunca bloquea `onApplicationBootstrap`.
    this.worker.run().catch((error: unknown) => {
      const clase = error instanceof Error ? error.constructor.name : 'error';
      this.logger.warn(`El worker de ${NOMBRE_COLA_INBOX} terminó con un error (${clase}).`);
    });

    this.colaBullmq
      .upsertJobScheduler(
        ID_SCHEDULER_BARRIDO,
        { every: this.configuracion.INBOX_BARRIDO_MS },
        { name: NOMBRE_JOB_BARRIDO, data: {} },
      )
      .catch((error: unknown) => {
        const clase = error instanceof Error ? error.constructor.name : 'error';
        this.logger.warn(`No se pudo registrar el barrido de ${NOMBRE_COLA_INBOX} (${clase}).`);
      });
  }

  /**
   * D6/PLT5: Nest ejecuta todas las `beforeApplicationShutdown` de la app antes que cualquier
   * `onApplicationShutdown` (fase de `PrismaService`/`RedisModule`) — esperar aquí el job activo
   * garantiza que ningún job en curso pierda Prisma ni Redis a mitad de camino.
   */
  async beforeApplicationShutdown(): Promise<void> {
    await this.worker.close();
  }
}
