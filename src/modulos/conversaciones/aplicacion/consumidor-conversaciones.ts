import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  LECTOR_MENSAJE_CANAL,
  SALIDA_CANAL,
  type ConsumidorEventosCanal,
  type EventoCanal,
  type LectorMensajeCanal,
  type SalidaCanal,
} from '../../canales/index.js';
import { CONFIGURACION, type Configuracion } from '../../../plataforma/config/index.js';
import { CLOCK, type Clock } from '../../../plataforma/reloj/index.js';
import { ColaTurno } from '../infraestructura/colas/cola-turno.js';
import { BufferTurno } from '../infraestructura/redis/buffer-turno.js';
import { ContadorRateLimit } from '../infraestructura/redis/contador-rate-limit.js';
import { MarcaEsperaHandoff } from '../infraestructura/redis/marca-espera-handoff.js';
import type { MensajeTurno } from '../puertos/generador-respuesta.js';
import { INTERRUPTOR_GLOBAL, type InterruptorGlobal } from '../puertos/interruptor-global.js';
import {
  REPOSITORIO_PARAMETRO_CONVERSACIONES,
  type RepositorioParametroConversaciones,
} from '../puertos/repositorio-parametro-conversaciones.js';
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
    @Inject(REPOSITORIO_PARAMETRO_CONVERSACIONES)
    private readonly repositorioParametro: RepositorioParametroConversaciones,
    @Inject(SALIDA_CANAL) private readonly salidaCanal: SalidaCanal,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly contadorRateLimit: ContadorRateLimit,
    private readonly buffer: BufferTurno,
    private readonly colaTurno: ColaTurno,
    private readonly marcaEsperaHandoff: MarcaEsperaHandoff,
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

    if (conversacion.estado === 'handoff_pendiente') {
      await this.avisarEsperaSiCorresponde(conversacion);
      return;
    }
    if (conversacion.estado !== 'bot') return;

    const texto = await this.lectorMensaje.obtenerTexto(evento.conversacion.idExterno, evento.idMensaje);
    const mensaje: MensajeTurno = { idMensaje: evento.idMensaje, texto: texto ?? '' };
    await this.buffer.push(conversacion.id, JSON.stringify(mensaje));
    await this.colaTurno.encolarConDebounce(conversacion.id);
  }

  /**
   * CNV3/D12: si ya pasó `HANDOFF_ESPERA_MIN` desde que la conversación entró a
   * `handoff_pendiente` (`expiraControlEn - HANDOFF_TTL_MIN + HANDOFF_ESPERA_MIN`, D12) y la marca
   * no existe todavía, envía el único mensaje de espera y la crea; si ya existe, no hace nada.
   */
  private async avisarEsperaSiCorresponde(conversacion: Conversacion): Promise<void> {
    if (conversacion.expiraControlEn === null) return; // defensivo: no debería pasar en handoff_pendiente

    const entradaMasEspera = new Date(
      conversacion.expiraControlEn.getTime() -
        this.configuracion.HANDOFF_TTL_MIN * 60_000 +
        this.configuracion.HANDOFF_ESPERA_MIN * 60_000,
    );
    if (this.clock.ahora() < entradaMasEspera) return;

    const esPrimeraVez = await this.marcaEsperaHandoff.marcarSiEsPrimeraVez(conversacion.id);
    if (!esPrimeraVez) return;

    // Relectura justo antes de enviar (mismo principio que R5/D10), pero con la condición correcta
    // para este mensaje: seguir en `handoff_pendiente`, no `bot`. Por eso no usa
    // `EnviarRespuestaTurno` (T6): ese punto de salida exige `estado === 'bot'` de forma literal
    // (R5), condición que aquí sería siempre falsa y bloquearía el aviso por completo (D12 lo pedía
    // vía ENVIAR_RESPUESTA_TURNO, pero design.md no anticipó este choque — desviación anotada en
    // tasks.md T8).
    const fresca = await this.repositorio.obtenerPorId(conversacion.id);
    if (fresca === null || fresca.estado !== 'handoff_pendiente') return;

    const mensajeEspera = await this.repositorioParametro.obtenerMensajeEsperaHandoff();
    await this.salidaCanal.enviarMensajes({
      idConversacion: conversacion.id,
      idRespuesta: `espera-handoff:${conversacion.id}`,
      mensajes: [{ tipo: 'texto', texto: mensajeEspera }],
    });
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
      await this.marcaEsperaHandoff.borrar(conversacion.id);
      return;
    }
    if (evento.estado === 'resuelta' && bajoControlHumano) {
      await this.transicionarConversacion.ejecutar(conversacion, 'bot', 'chatwoot_resolved');
      await this.marcaEsperaHandoff.borrar(conversacion.id);
      return;
    }
    if (evento.estado === 'abierta' && conversacion.estado === 'bot') {
      await this.cederAHumano(conversacion);
      return;
    }
    // Cualquier otra combinación (p. ej. "pending" repetido sobre una conversación ya en bot):
    // no-op idempotente (D5, ADR-0004), sin tocar el repositorio.
  }

  /**
   * Capa 2 de R8: transiciona a humano, cancela el job diferido y vacía el buffer. También borra
   * la marca de espera de `handoff_pendiente` (D12): un eco humano saca a la conversación de ese
   * estado igual que "pending"/"resolved".
   */
  private async cederAHumano(conversacion: Conversacion): Promise<void> {
    await this.transicionarConversacion.ejecutar(conversacion, 'humano', 'eco_humano');
    await this.colaTurno.cancelarJobDiferido(conversacion.id);
    await this.buffer.vaciar(conversacion.id);
    await this.marcaEsperaHandoff.borrar(conversacion.id);
  }
}
