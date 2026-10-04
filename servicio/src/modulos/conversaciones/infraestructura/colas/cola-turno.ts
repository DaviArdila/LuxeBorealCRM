import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  Inject,
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { CONFIGURACION, type Configuracion } from '../../../../plataforma/config/index.js';
import { ProcesarTurno } from '../../aplicacion/procesar-turno.js';

/** Nombre de la cola del debounce de turnos (D6 de `design.md`). */
export const NOMBRE_COLA_TURNO = 'conversaciones-turno';

/** Nombre del job normal de procesamiento (distinto de un futuro job de respaldo, D6). */
export const NOMBRE_JOB_TURNO = 'procesar-turno';

/** BullMQ rechaza `:` en un `jobId` (`Job.validateOptions`), a diferencia de las claves de Redis. */
export function idJobTurno(idConversacion: string): string {
  return `turno-${idConversacion}`;
}

/**
 * Id del job de respaldo. `ProcesarTurno` lo recibe como `idRespuesta` y el outbox de `canales` solo
 * acepta `[A-Za-z0-9_-]{1,64}`: el sufijo aleatorio usa 8 caracteres de un UUID (no el UUID entero) para
 * que `turno-<uuid>-respaldo-<sufijo>` (59 caracteres) quepa. La unicidad la da el azar, no el largo.
 */
export function idJobRespaldo(jobId: string): string {
  return `${jobId}-respaldo-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Debounce + processor del turno sobre BullMQ (D6, D7, D8 de `design.md`; B6 del prototipo), en una
 * sola clase — a diferencia de `canales` (que separa `ColaEventosEntrantesBullmq` del processor),
 * aquí productor y consumidor comparten la misma cola y `tasks.md` T4 no lista un archivo aparte
 * para el `WorkerHost`.
 *
 * Productor: `jobId = turno:<idConv>` hace que un mensaje nuevo reemplace el job pendiente y
 * reinicie el reloj del debounce (`encolarConDebounce`). Si `ProcesarTurno` ya tomó el job
 * (`active`), se agrega uno de respaldo con id único para que alguien vuelva a mirar el buffer
 * cuando termine ese turno (mismo caso límite del prototipo).
 *
 * Consumidor: `WorkerHost` con concurrencia configurable (`CONVERSACIONES_CONCURRENCIA`, D7) —
 * conversaciones **distintas** corren en paralelo; el lock de `ProcesarTurno` es lo único que
 * impide que la **misma** conversación corra dos veces a la vez. `@Processor` no puede leer
 * `Configuracion` inyectada en tiempo de decoración (arranca antes que Nest resuelva providers), así
 * que la concurrencia real se fija en `onApplicationBootstrap` vía `this.worker.concurrency` (BullMQ
 * expone esa propiedad como mutable), no en el decorador.
 */
@Injectable()
@Processor(NOMBRE_COLA_TURNO, { autorun: false })
export class ColaTurno extends WorkerHost implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(ColaTurno.name);

  constructor(
    @InjectQueue(NOMBRE_COLA_TURNO) private readonly cola: Queue<string>,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
    private readonly procesarTurno: ProcesarTurno,
  ) {
    super();
    this.cola.on('error', (error) => {
      this.logger.warn(`Cola ${NOMBRE_COLA_TURNO} emitió un error: ${error.constructor.name}`);
    });
  }

  async encolarConDebounce(idConversacion: string): Promise<void> {
    const jobId = idJobTurno(idConversacion);
    const existente = await this.cola.getJob(jobId);

    if (existente !== undefined && (await existente.isActive())) {
      await this.agregar(idJobRespaldo(jobId), idConversacion);
      return;
    }
    if (existente !== undefined) {
      await existente.remove();
    }
    await this.agregar(jobId, idConversacion);
  }

  async cancelarJobDiferido(idConversacion: string): Promise<void> {
    const existente = await this.cola.getJob(idJobTurno(idConversacion));
    if (existente !== undefined && !(await existente.isActive())) {
      await existente.remove();
    }
  }

  async process(job: Job<string>): Promise<void> {
    const idConversacion = job.data;
    const resultado = await this.procesarTurno.ejecutar(idConversacion, job.id ?? idConversacion);
    if (resultado.reencolar) {
      await this.encolarConDebounce(idConversacion);
    }
  }

  /** D6: todo Worker tiene un listener de 'error'; sin él, Node lo convierte en excepción no capturada. */
  @OnWorkerEvent('error')
  manejarErrorDelWorker(error: Error): void {
    this.logger.warn(`Worker de ${NOMBRE_COLA_TURNO} emitió un error: ${error.constructor.name}`);
  }

  onApplicationBootstrap(): void {
    if (!this.configuracion.COLAS_TRABAJADORES) {
      return;
    }

    this.worker.concurrency = this.configuracion.CONVERSACIONES_CONCURRENCIA;
    // `worker.run()` no se espera (D6): el arranque de la app no depende de que el worker esté
    // consumiendo; un fallo se loguea, nunca bloquea `onApplicationBootstrap`.
    this.worker.run().catch((error: unknown) => {
      const clase = error instanceof Error ? error.constructor.name : 'error';
      this.logger.warn(`El worker de ${NOMBRE_COLA_TURNO} terminó con un error (${clase}).`);
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

  private async agregar(jobId: string, idConversacion: string): Promise<void> {
    await this.cola.add(NOMBRE_JOB_TURNO, idConversacion, {
      jobId,
      delay: this.configuracion.DEBOUNCE_MS,
      attempts: 2,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: true,
    });
  }
}
