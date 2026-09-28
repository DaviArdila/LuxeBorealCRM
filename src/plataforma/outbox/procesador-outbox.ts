import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  Inject,
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { CONFIGURACION } from '../config/index.js';
import type { Configuracion } from '../config/index.js';
import { PublicadorOutbox } from './publicador-outbox.js';
import { NOMBRE_COLA_OUTBOX, NOMBRE_JOB_BARRIDO_OUTBOX } from './tipos.js';

/** Id del `JobScheduler` de BullMQ que dispara el barrido (D10); estable entre reinicios. */
const ID_SCHEDULER_BARRIDO_OUTBOX = 'barrido-outbox';

/**
 * `WorkerHost` de BullMQ sobre la cola {@link NOMBRE_COLA_OUTBOX} (concurrencia 1, `autorun:
 * false`, D10 de `design.md`). Tanto el job normal (`publicar`, disparado por
 * `RegistroOutboxPrisma.agregar`) como el job repetible de barrido llaman a
 * {@link PublicadorOutbox.publicarPendientes}: a diferencia del inbox (D7), el barrido del outbox
 * no necesita listar filas primero — `publicarPendientes` ya reclama todo lo que esté listo por su
 * cuenta (D10: "hace lo mismo").
 */
@Injectable()
@Processor(NOMBRE_COLA_OUTBOX, { concurrency: 1, autorun: false })
export class ProcesadorOutbox
  extends WorkerHost
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private readonly logger = new Logger(ProcesadorOutbox.name);

  constructor(
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
    @InjectQueue(NOMBRE_COLA_OUTBOX) private readonly colaBullmq: Queue,
    private readonly publicadorOutbox: PublicadorOutbox,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    // El job normal (`publicar`) y el de barrido llaman a lo mismo (D10); `job.name` solo es útil
    // para el log de depuración, nunca cambia el comportamiento.
    this.logger.debug(`Procesando job "${job.name}" de ${NOMBRE_COLA_OUTBOX}`);
    await this.publicadorOutbox.publicarPendientes();
  }

  /** D6: todo Worker tiene un listener de 'error'; sin él, Node lo convierte en excepción no capturada. */
  @OnWorkerEvent('error')
  manejarErrorDelWorker(error: Error): void {
    this.logger.warn(`Worker de ${NOMBRE_COLA_OUTBOX} emitió un error: ${error.constructor.name}`);
  }

  onApplicationBootstrap(): void {
    if (!this.configuracion.COLAS_TRABAJADORES) {
      return;
    }

    // `worker.run()` no se espera (D6): el arranque de la app no depende de que el worker esté
    // consumiendo; un fallo se loguea, nunca bloquea `onApplicationBootstrap`.
    this.worker.run().catch((error: unknown) => {
      const clase = error instanceof Error ? error.constructor.name : 'error';
      this.logger.warn(`El worker de ${NOMBRE_COLA_OUTBOX} terminó con un error (${clase}).`);
    });

    this.colaBullmq
      .upsertJobScheduler(
        ID_SCHEDULER_BARRIDO_OUTBOX,
        { every: this.configuracion.OUTBOX_BARRIDO_MS },
        { name: NOMBRE_JOB_BARRIDO_OUTBOX, data: {} },
      )
      .catch((error: unknown) => {
        const clase = error instanceof Error ? error.constructor.name : 'error';
        this.logger.warn(`No se pudo registrar el barrido de ${NOMBRE_COLA_OUTBOX} (${clase}).`);
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
