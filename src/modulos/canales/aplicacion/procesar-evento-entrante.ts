import { Inject, Injectable } from '@nestjs/common';
import { CLOCK } from '../../../plataforma/reloj/index.js';
import type { Clock } from '../../../plataforma/reloj/index.js';
import {
  REPOSITORIO_EVENTO_ENTRANTE,
  type RepositorioEventoEntrante,
} from '../puertos/repositorio-evento-entrante.js';
import { RegistroConsumidorEventosCanal } from './registro-consumidor-eventos-canal.js';

/** `error` nunca lleva el `message` libre de la excepción (R14); truncado por si acaso. */
const LARGO_MAXIMO_ERROR = 200;

/**
 * Describe una excepción con `<Clase>[: código]`, nunca su `message` libre (D7, R14): el mensaje de
 * una excepción de negocio o de red podría arrastrar contenido del cliente o un token.
 */
function describirError(error: unknown): string {
  if (error instanceof Error) {
    const conCodigo = error as Error & { readonly code?: unknown };
    const codigo = typeof conCodigo.code === 'string' ? `: ${conCodigo.code}` : '';
    return `${error.constructor.name}${codigo}`.slice(0, LARGO_MAXIMO_ERROR);
  }
  return 'error-desconocido'.slice(0, LARGO_MAXIMO_ERROR);
}

/**
 * Caso de uso de D7 de `design.md`: procesa un evento del inbox delegando en el consumidor
 * registrado (D8). `ProcesadorInbox` (infraestructura, T4) es quien decide `esUltimoIntento` a
 * partir del `Job` real de BullMQ (`job.attemptsMade + 1 >= attempts`) — este caso de uso no
 * conoce BullMQ, así que se prueba con dobles de puertos y un `ClockFalso`, sin infraestructura.
 */
@Injectable()
export class ProcesarEventoEntrante {
  constructor(
    @Inject(REPOSITORIO_EVENTO_ENTRANTE) private readonly repositorio: RepositorioEventoEntrante,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly registro: RegistroConsumidorEventosCanal,
  ) {}

  async ejecutar(id: string, esUltimoIntento: boolean): Promise<void> {
    const evento = await this.repositorio.iniciarIntento(id);
    if (evento === null) {
      // Ya procesada o muerta: idempotente frente a jobs duplicados o stalled (D7).
      return;
    }

    // `v` hoy solo puede ser `1` (único valor del tipo `EventoCanal`); esta comprobación es
    // defensiva de cara a una versión futura del payload, sin forzar `EventoCanal` a una unión más
    // amplia todavía (D4 no la necesita hoy) — de ahí el acceso sin aserción de tipo estrecha.
    const version: unknown = (evento as { readonly v: unknown }).v;
    if (version !== 1) {
      const error = new Error(`Versión de evento no soportada: ${String(version)}`);
      if (esUltimoIntento) {
        await this.repositorio.marcarMuerto(id, describirError(error));
      }
      throw error;
    }

    try {
      await this.registro.obtener().consumir(evento);
    } catch (error) {
      if (esUltimoIntento) {
        await this.repositorio.marcarMuerto(id, describirError(error));
      }
      throw error;
    }

    await this.repositorio.marcarProcesado(id, this.clock.ahora());
  }
}
