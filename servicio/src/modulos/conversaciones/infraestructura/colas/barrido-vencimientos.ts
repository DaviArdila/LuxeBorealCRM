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
import { CLOCK, type Clock } from '../../../../plataforma/reloj/index.js';
import { TransicionarConversacion } from '../../aplicacion/transicionar-conversacion.js';
import { REPOSITORIO_CONVERSACION, type RepositorioConversacion } from '../../puertos/repositorio-conversacion.js';

/** Nombre de la cola dedicada al barrido de vencimientos (D11 de `design.md`). */
export const NOMBRE_COLA_BARRIDO_VENCIMIENTOS = 'conversaciones-barrido-vencimientos';

const NOMBRE_JOB_BARRIDO = 'barrido-vencimientos';
/** Id del `JobScheduler` de BullMQ que dispara el barrido (D11); estable entre reinicios. */
const ID_SCHEDULER_BARRIDO = 'barrido-vencimientos';

/**
 * Barrido repetible de vencimientos (D11 de `design.md`, R7): `listarVencidas(ahora)` (D2) → por
 * cada fila, `transicionar(id, 'bot', 'ttl')` (D3) — **sin llamar a `ENVIAR_RESPUESTA_TURNO`**, el
 * retorno es silencioso. Un conflicto de versión (u otro error puntual) en una fila se salta sin
 * reintentar más allá del reintento único que ya hace `TransicionarConversacion`: el próximo
 * barrido (5 min después por defecto, o antes si algo la vuelve a marcar vencida) la recoge.
 */
@Injectable()
@Processor(NOMBRE_COLA_BARRIDO_VENCIMIENTOS, { concurrency: 1, autorun: false })
export class BarridoVencimientos
  extends WorkerHost
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private readonly logger = new Logger(BarridoVencimientos.name);

  constructor(
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(REPOSITORIO_CONVERSACION) private readonly repositorio: RepositorioConversacion,
    private readonly transicionarConversacion: TransicionarConversacion,
    @InjectQueue(NOMBRE_COLA_BARRIDO_VENCIMIENTOS) private readonly colaBullmq: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    void job; // único job de esta cola: siempre dispara el barrido completo.
    await this.ejecutarBarrido();
  }

  async ejecutarBarrido(): Promise<void> {
    const ahora = this.clock.ahora();
    const vencidas = await this.repositorio.listarVencidas(ahora);

    for (const conversacion of vencidas) {
      try {
        await this.transicionarConversacion.ejecutar(conversacion, 'bot', 'ttl');
      } catch (error) {
        const clase = error instanceof Error ? error.constructor.name : 'error';
        this.logger.warn(
          `Barrido de vencimientos: no se pudo devolver a bot la conversación ${conversacion.id} (${clase}); el próximo barrido la recoge.`,
        );
      }
    }
  }

  /** D6: todo Worker tiene un listener de 'error'; sin él, Node lo convierte en excepción no capturada. */
  @OnWorkerEvent('error')
  manejarErrorDelWorker(error: Error): void {
    this.logger.warn(`Worker de ${NOMBRE_COLA_BARRIDO_VENCIMIENTOS} emitió un error: ${error.constructor.name}`);
  }

  onApplicationBootstrap(): void {
    if (!this.configuracion.COLAS_TRABAJADORES) {
      return;
    }

    this.worker.run().catch((error: unknown) => {
      const clase = error instanceof Error ? error.constructor.name : 'error';
      this.logger.warn(`El worker de ${NOMBRE_COLA_BARRIDO_VENCIMIENTOS} terminó con un error (${clase}).`);
    });

    this.colaBullmq
      .upsertJobScheduler(
        ID_SCHEDULER_BARRIDO,
        { every: this.configuracion.CONVERSACIONES_BARRIDO_MS },
        { name: NOMBRE_JOB_BARRIDO, data: {} },
      )
      .catch((error: unknown) => {
        const clase = error instanceof Error ? error.constructor.name : 'error';
        this.logger.warn(`No se pudo registrar el barrido de ${NOMBRE_COLA_BARRIDO_VENCIMIENTOS} (${clase}).`);
      });
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.worker.close();
  }
}
