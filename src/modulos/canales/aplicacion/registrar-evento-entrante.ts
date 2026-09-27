import { Inject, Injectable, Logger } from '@nestjs/common';
import type { EventoCanal } from '../dominio/evento-canal.js';
import {
  COLA_EVENTOS_ENTRANTES,
  type ColaEventosEntrantes,
} from '../puertos/cola-eventos-entrantes.js';
import {
  REPOSITORIO_EVENTO_ENTRANTE,
  type RepositorioEventoEntrante,
} from '../puertos/repositorio-evento-entrante.js';

/** Tope de espera para el disparo de la cola (D5, CAN1): más allá de esto, solo se loguea. */
const TOPE_ENCOLADO_MS = 200;

export interface EntradaRegistrarEventoEntrante {
  readonly origen: string;
  readonly idExterno: string;
  readonly payload: EventoCanal;
}

/** Estado que el controlador del webhook devuelve al proveedor (D5); `'ignorado'` lo decide él mismo. */
export type EstadoRegistroEntrante = 'registrado' | 'duplicado';

/**
 * Caso de uso de D5 de `design.md`: registra el evento ya traducido en `evento_entrante`
 * (dedupe por `(origen, idExterno)`, R4) y dispara la cola del inbox con un tope de 200 ms, sin
 * que un Redis lento o caído bloquee la respuesta al webhook (CAN1) ni haga fallar el registro —
 * la fila ya quedó confirmada en Postgres; el barrido del procesador (T4) la recoge si el disparo
 * se perdió.
 *
 * Usa `Logger` de `@nestjs/common` (construido con `new`, sin `@Inject`) en vez de
 * `@InjectPinoLogger` de `nestjs-pino`: hallazgo real de esta tarea — bajo `@nestjs/testing`
 * (`TestingInjector`), un provider de `CanalesModule` que inyecta el `PinoLogger` del `LoggerModule`
 * global falla a resolver en algunos árboles de módulos de prueba (`AppModule` completo), aunque
 * `NestFactory.create` real (producción) nunca lo sufre. `app.useLogger(app.get(Logger))` en
 * `configurarAplicacion` (D14) sobrescribe el logger estático de Nest con el de `nestjs-pino` para
 * todo el proceso, así que `new Logger(...)` sigue saliendo por pino con la misma redacción —
 * mismo mecanismo que documenta `nestjs-pino` para código que no quiere depender de su DI.
 */
@Injectable()
export class RegistrarEventoEntrante {
  private readonly logger = new Logger(RegistrarEventoEntrante.name);

  constructor(
    @Inject(REPOSITORIO_EVENTO_ENTRANTE) private readonly repositorio: RepositorioEventoEntrante,
    @Inject(COLA_EVENTOS_ENTRANTES) private readonly cola: ColaEventosEntrantes,
  ) {}

  async ejecutar(entrada: EntradaRegistrarEventoEntrante): Promise<EstadoRegistroEntrante> {
    const resultado = await this.repositorio.registrar(entrada);
    if (resultado.resultado === 'duplicado') {
      return 'duplicado';
    }

    await this.encolarConTope(resultado.id);
    return 'registrado';
  }

  private async encolarConTope(id: string): Promise<void> {
    // El `.catch` se adjunta de inmediato (no dentro del `Promise.race`) para que un rechazo que
    // llegue después de que el tope ya ganó la carrera no quede como una excepción no capturada.
    const intentoEncolar = this.cola.encolar(id).catch((error: unknown) => {
      const clase = error instanceof Error ? error.constructor.name : 'error';
      this.logger.warn(
        `No se pudo encolar el evento entrante ${id} dentro del tope (${clase}); ` +
          'el barrido del inbox lo reintentará',
      );
    });
    const tope = new Promise<void>((resolver) => {
      setTimeout(resolver, TOPE_ENCOLADO_MS);
    });

    await Promise.race([intentoEncolar, tope]);
  }
}
