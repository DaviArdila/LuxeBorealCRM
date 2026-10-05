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
import { ProcesarEsperasClientes } from '../../aplicacion/procesar-esperas-clientes.js';

/** Nombre de la cola dedicada al barrido de esperas de clientes (D5 de la Fase 08d). */
export const NOMBRE_COLA_BARRIDO_ESPERAS = 'conversaciones-barrido-esperas';

const NOMBRE_JOB_BARRIDO = 'barrido-esperas';
/** Id del `JobScheduler` de BullMQ que dispara el barrido; estable entre reinicios. */
const ID_SCHEDULER_BARRIDO = 'barrido-esperas';

/**
 * Barrido repetible de clientes que esperan respuesta bajo control humano (NTF7, D5 de la Fase 08d): cada
 * `ESPERA_CLIENTE_BARRIDO_MS` corre {@link ProcesarEsperasClientes}. Va aparte de `BarridoVencimientos`, que corre
 * cada 5 minutos por defecto: con ese ritmo el aviso saldría entre 10 y 15 minutos y no a los 10. Mismo patrón que
 * `BarridoLeads` y `BarridoVencimientos`: un solo job repetible, un worker con listener de error y apagado limpio.
 * Un fallo en un barrido se registra (solo la clase del error, R14) y el siguiente lo reintenta.
 */
@Injectable()
@Processor(NOMBRE_COLA_BARRIDO_ESPERAS, { concurrency: 1, autorun: false })
export class BarridoEsperas extends WorkerHost implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(BarridoEsperas.name);

  constructor(
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
    private readonly procesarEsperas: ProcesarEsperasClientes,
    @InjectQueue(NOMBRE_COLA_BARRIDO_ESPERAS) private readonly colaBullmq: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    void job; // único job de esta cola: siempre dispara el barrido completo.
    await this.ejecutarBarrido();
  }

  async ejecutarBarrido(): Promise<number> {
    try {
      return await this.procesarEsperas.ejecutar();
    } catch (error) {
      this.logger.warn({
        evento: 'conversaciones.barrido-esperas-fallo',
        error: error instanceof Error ? error.name : 'desconocido',
      });
      return 0;
    }
  }

  /** Todo Worker tiene un listener de 'error'; sin él, Node lo convierte en excepción no capturada. */
  @OnWorkerEvent('error')
  manejarErrorDelWorker(error: Error): void {
    this.logger.warn(`Worker de ${NOMBRE_COLA_BARRIDO_ESPERAS} emitió un error: ${error.constructor.name}`);
  }

  onApplicationBootstrap(): void {
    if (!this.configuracion.COLAS_TRABAJADORES) {
      return;
    }

    this.worker.run().catch((error: unknown) => {
      const clase = error instanceof Error ? error.constructor.name : 'error';
      this.logger.warn(`El worker de ${NOMBRE_COLA_BARRIDO_ESPERAS} terminó con un error (${clase}).`);
    });

    this.colaBullmq
      .upsertJobScheduler(
        ID_SCHEDULER_BARRIDO,
        { every: this.configuracion.ESPERA_CLIENTE_BARRIDO_MS },
        { name: NOMBRE_JOB_BARRIDO, data: {} },
      )
      .catch((error: unknown) => {
        const clase = error instanceof Error ? error.constructor.name : 'error';
        this.logger.warn(`No se pudo registrar el barrido de ${NOMBRE_COLA_BARRIDO_ESPERAS} (${clase}).`);
      });
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.worker.close();
  }
}
