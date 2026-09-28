import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  LECTOR_MENSAJE_CANAL,
  type ConsumidorEventosCanal,
  type EventoCanal,
  type LectorMensajeCanal,
} from '../../canales/index.js';
import { ColaTurno } from '../infraestructura/colas/cola-turno.js';
import { BufferTurno } from '../infraestructura/redis/buffer-turno.js';
import { ContadorRateLimit } from '../infraestructura/redis/contador-rate-limit.js';
import type { MensajeTurno } from '../puertos/generador-respuesta.js';
import { INTERRUPTOR_GLOBAL, type InterruptorGlobal } from '../puertos/interruptor-global.js';
import {
  REPOSITORIO_CONVERSACION,
  type Conversacion,
  type RepositorioConversacion,
} from '../puertos/repositorio-conversacion.js';
import { TransicionarConversacion } from './transicionar-conversacion.js';

/**
 * Traduce cada tipo de `EventoCanal` a la acción correspondiente (D5 de `design.md`, CNV5). Se
 * registra en `RegistroConsumidorEventosCanal` desde `onModuleInit` de `ConversacionesModule`
 * (`conversaciones.module.ts`). `consumir` MUST ser idempotente (ADR-0004): una transición que no
 * cambia nada es un no-op observable, sin tocar el repositorio.
 */
@Injectable()
export class ConsumidorConversaciones implements ConsumidorEventosCanal {
  private readonly logger = new Logger(ConsumidorConversaciones.name);

  constructor(
    @Inject(REPOSITORIO_CONVERSACION) private readonly repositorio: RepositorioConversacion,
    @Inject(INTERRUPTOR_GLOBAL) private readonly interruptor: InterruptorGlobal,
    @Inject(LECTOR_MENSAJE_CANAL) private readonly lectorMensaje: LectorMensajeCanal,
    private readonly contadorRateLimit: ContadorRateLimit,
    private readonly buffer: BufferTurno,
    private readonly colaTurno: ColaTurno,
    private readonly transicionarConversacion: TransicionarConversacion,
  ) {}

  async consumir(evento: EventoCanal): Promise<void> {
    if (evento.tipo === 'mensaje-entrante') {
      await this.manejarMensajeEntrante(evento);
      return;
    }
    if (evento.tipo === 'mensaje-humano') {
      await this.manejarMensajeHumano(evento);
      return;
    }
    await this.manejarCambioEstado(evento);
  }

  /**
   * `ObtenerOCrearConversacion` siempre corre primero (contacto/actividad quedan registrados
   * igual, CNV2/CNV4/R13); solo la generación de respuesta se salta si el interruptor está
   * apagado, el rate limit se superó, o el estado ya no es `bot`.
   */
  private async manejarMensajeEntrante(evento: Extract<EventoCanal, { tipo: 'mensaje-entrante' }>): Promise<void> {
    const conversacion = await this.repositorio.obtenerOCrear(
      Number(evento.conversacion.idExterno),
      evento.conversacion.idContactoExterno,
      evento.conversacion.canal,
    );

    const activo = await this.interruptor.estaActivo();
    if (!activo) return;

    const dentroDelLimite = await this.contadorRateLimit.verificarLimite(conversacion.contactoId);
    if (!dentroDelLimite) return;

    if (conversacion.estado !== 'bot') return;

    const texto = await this.lectorMensaje.obtenerTexto(evento.conversacion.idExterno, evento.idMensaje);
    const mensaje: MensajeTurno = { idMensaje: evento.idMensaje, texto: texto ?? '' };
    await this.buffer.push(conversacion.id, JSON.stringify(mensaje));
    await this.colaTurno.encolarConDebounce(conversacion.id);
  }

  private async manejarMensajeHumano(evento: Extract<EventoCanal, { tipo: 'mensaje-humano' }>): Promise<void> {
    const conversacion = await this.repositorio.obtenerPorConversacionCanal(Number(evento.conversacion.idExterno));
    if (conversacion === null) {
      this.logger.warn('Eco humano recibido sin conversación existente registrada; se ignora.');
      return;
    }
    await this.cederAHumano(conversacion);
  }

  private async manejarCambioEstado(evento: Extract<EventoCanal, { tipo: 'estado-conversacion' }>): Promise<void> {
    const conversacion = await this.repositorio.obtenerPorConversacionCanal(Number(evento.conversacion.idExterno));
    if (conversacion === null) return;

    const bajoControlHumano = conversacion.estado === 'humano' || conversacion.estado === 'handoff_pendiente';

    if (evento.estado === 'pendiente' && bajoControlHumano) {
      await this.transicionarConversacion.ejecutar(conversacion, 'bot', 'chatwoot_pending');
      return;
    }
    if (evento.estado === 'resuelta' && bajoControlHumano) {
      await this.transicionarConversacion.ejecutar(conversacion, 'bot', 'chatwoot_resolved');
      return;
    }
    if (evento.estado === 'abierta' && conversacion.estado === 'bot') {
      await this.cederAHumano(conversacion);
      return;
    }
    // Cualquier otra combinación (p. ej. "pending" repetido sobre una conversación ya en bot):
    // no-op idempotente (D5, ADR-0004), sin tocar el repositorio.
  }

  /** Capa 2 de R8: transiciona a humano, cancela el job diferido y vacía el buffer. */
  private async cederAHumano(conversacion: Conversacion): Promise<void> {
    await this.transicionarConversacion.ejecutar(conversacion, 'humano', 'eco_humano');
    await this.colaTurno.cancelarJobDiferido(conversacion.id);
    await this.buffer.vaciar(conversacion.id);
  }
}
