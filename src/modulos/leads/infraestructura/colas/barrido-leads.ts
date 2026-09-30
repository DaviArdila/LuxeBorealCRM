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
import { RecordarLeads } from '../../aplicacion/recordar-leads.js';

/** Nombre de la cola dedicada al barrido de recordatorios de leads (D10 de la Fase 08). */
export const NOMBRE_COLA_BARRIDO_LEADS = 'leads-barrido';

const NOMBRE_JOB_BARRIDO = 'barrido-leads';
/** Id estable del `JobScheduler` de BullMQ: el barrido se reprograma, no se duplica, entre reinicios. */
const ID_SCHEDULER_BARRIDO = 'barrido-leads';

/**
 * Barrido repetible de leads sin atender (D10, LDS5): mismo patrón que `BarridoVencimientos` de
 * `conversaciones`. Cada corrida llama a `RecordarLeads`; un fallo se registra sin datos del lead y el
 * siguiente barrido reintenta. Sin `COLAS_TRABAJADORES` (contexto del contrato OpenAPI) no arranca.
 */
@Injectable()
@Processor(NOMBRE_COLA_BARRIDO_LEADS, { concurrency: 1, autorun: false })
export class BarridoLeads extends WorkerHost implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(BarridoLeads.name);

  constructor(
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
    private readonly recordarLeads: RecordarLeads,
    @InjectQueue(NOMBRE_COLA_BARRIDO_LEADS) private readonly colaBullmq: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    void job; // único job de esta cola: siempre dispara el barrido completo.
    await this.recordarLeads.ejecutar();
  }

  /** D6: todo Worker tiene un listener de 'error'; sin él, Node lo convierte en excepción no capturada. */
  @OnWorkerEvent('error')
  manejarErrorDelWorker(error: Error): void {
    this.logger.warn(`Worker de ${NOMBRE_COLA_BARRIDO_LEADS} emitió un error: ${error.constructor.name}`);
  }

  onApplicationBootstrap(): void {
    if (!this.configuracion.COLAS_TRABAJADORES) {
      return;
    }

    this.worker.run().catch((error: unknown) => {
      const clase = error instanceof Error ? error.constructor.name : 'error';
      this.logger.warn(`El worker de ${NOMBRE_COLA_BARRIDO_LEADS} terminó con un error (${clase}).`);
    });

    this.colaBullmq
      .upsertJobScheduler(
        ID_SCHEDULER_BARRIDO,
        { every: this.configuracion.LEADS_BARRIDO_MS },
        { name: NOMBRE_JOB_BARRIDO, data: {} },
      )
      .catch((error: unknown) => {
        const clase = error instanceof Error ? error.constructor.name : 'error';
        this.logger.warn(`No se pudo registrar el barrido de ${NOMBRE_COLA_BARRIDO_LEADS} (${clase}).`);
      });
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.worker.close();
  }
}
