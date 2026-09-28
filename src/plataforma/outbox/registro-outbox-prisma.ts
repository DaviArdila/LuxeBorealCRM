import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/index.js';
import { NOMBRE_COLA_OUTBOX, NOMBRE_JOB_PUBLICAR } from './tipos.js';
import type { NuevaEntradaOutbox, PayloadOutbox, RegistroOutbox } from './tipos.js';

/** Tope de espera para el disparo de la cola (D5, D10): mismo patrón que `RegistrarEventoEntrante`. */
const TOPE_ENCOLADO_MS = 200;

/**
 * Misma forma recursiva que Prisma exige para una columna `@db.JsonB`, declarada aquí en vez de
 * importar el tipo del cliente generado (regla de fronteras `sin-rutas-internas-de-plataforma`,
 * mismo criterio que `repositorio-evento-entrante-prisma.ts` de `modulos/canales`).
 */
type ValorJsonbAnidado =
  | string
  | number
  | boolean
  | null
  | { readonly [clave: string]: ValorJsonbAnidado }
  | readonly ValorJsonbAnidado[];
type ValorJsonbEscribible = Exclude<ValorJsonbAnidado, null>;

function payloadDesdeEntrada(entrada: NuevaEntradaOutbox): PayloadOutbox {
  return entrada.efimero === undefined
    ? { v: 1, grupo: entrada.grupo, orden: entrada.orden, datos: entrada.datos }
    : { v: 1, grupo: entrada.grupo, orden: entrada.orden, datos: entrada.datos, efimero: entrada.efimero };
}

/**
 * Adaptador Prisma del puerto {@link RegistroOutbox} (D10, D11): `createMany` con
 * `skipDuplicates: true` (`ON CONFLICT DO NOTHING` sobre `clave_idempotencia`, D11) es una sola
 * instrucción SQL — atómica por sí misma en Postgres, sin necesitar `$transaction` — que inserta
 * todas las filas de una llamada. Dispara después el mismo patrón de "tope de 200 ms" que
 * `RegistrarEventoEntrante` (D5): la fila ya quedó confirmada en Postgres; el barrido de
 * `ProcesadorOutbox` (D10) la recoge si el disparo se perdió.
 */
@Injectable()
export class RegistroOutboxPrisma implements RegistroOutbox {
  private readonly logger = new Logger(RegistroOutboxPrisma.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(NOMBRE_COLA_OUTBOX) private readonly cola: Queue,
  ) {
    // D6: toda Queue tiene un listener de 'error'; sin él, un Redis inaccesible se convierte en
    // una excepción no capturada. Nunca loguea PII: el error de conexión no lleva datos de cliente.
    this.cola.on('error', (error) => {
      this.logger.warn(`Cola ${NOMBRE_COLA_OUTBOX} emitió un error: ${error.constructor.name}`);
    });
  }

  async agregar(entradas: readonly NuevaEntradaOutbox[]): Promise<void> {
    if (entradas.length === 0) {
      return;
    }

    await this.prisma.outbox.createMany({
      data: entradas.map((entrada) => ({
        tipo: entrada.tipo,
        claveIdempotencia: entrada.claveIdempotencia,
        payload: payloadDesdeEntrada(entrada) as unknown as ValorJsonbEscribible,
      })),
      skipDuplicates: true,
    });

    await this.encolarConTope();
  }

  private async encolarConTope(): Promise<void> {
    // El `.catch` se adjunta de inmediato (no dentro del `Promise.race`) para que un rechazo que
    // llegue después de que el tope ya ganó la carrera no quede como una excepción no capturada.
    const intentoEncolar = this.cola
      .add(NOMBRE_JOB_PUBLICAR, {}, { removeOnComplete: true, removeOnFail: true })
      .catch((error: unknown) => {
        const clase = error instanceof Error ? error.constructor.name : 'error';
        this.logger.warn(
          `No se pudo encolar el disparo del outbox dentro del tope (${clase}); ` +
            'el barrido lo reintentará',
        );
      });
    const tope = new Promise<void>((resolver) => {
      setTimeout(resolver, TOPE_ENCOLADO_MS);
    });

    await Promise.race([intentoEncolar, tope]);
  }
}
