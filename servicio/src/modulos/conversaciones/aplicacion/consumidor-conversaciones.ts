import { Inject, Injectable, Logger } from '@nestjs/common';
import { TEXTOS_ASISTENTE, type TextosAsistente } from '../../asistente/index.js';
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
import { MarcaMensajeProcesado } from '../infraestructura/redis/marca-mensaje-procesado.js';
import type { MensajeTurno } from '../puertos/generador-respuesta.js';
import { MARCA_ESPERA_CLIENTE, type MarcaEsperaCliente } from '../puertos/marca-espera-cliente.js';
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
    @Inject(TEXTOS_ASISTENTE) private readonly textos: TextosAsistente,
    @Inject(SALIDA_CANAL) private readonly salidaCanal: SalidaCanal,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly contadorRateLimit: ContadorRateLimit,
    private readonly buffer: BufferTurno,
    private readonly colaTurno: ColaTurno,
    private readonly marcaEsperaHandoff: MarcaEsperaHandoff,
    private readonly marcaMensajeProcesado: MarcaMensajeProcesado,
    private readonly transicionarConversacion: TransicionarConversacion,
    @Inject(MARCA_ESPERA_CLIENTE) private readonly marcaEsperaCliente: MarcaEsperaCliente,
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
   *
   * Guarda de idempotencia (judgment-day, `ConsumidorEventosCanal` MUST ser idempotente): justo
   * después de `obtenerOCrear` se consulta `MarcaMensajeProcesado.estaProcesado` (lectura, no
   * escribe nada) para el corto-circuito habitual de una reentrega ya completada con éxito. El
   * trabajo real que la marca protege — interruptor, rate limit, aviso de espera y
   * buffer/debounce — vive en `procesarTrasVerificaciones`, y la marca se crea recién con
   * `marcarSiEsPrimeraVez` **después** de que ese trabajo termina sin lanzar (judgment-day ronda
   * 2, corrige `ddb72d2`): esa ronda anterior marcaba antes de intentar el trabajo, así que un
   * fallo transitorio de Redis/Postgres/BullMQ a mitad de turno dejaba la marca puesta sin que el
   * mensaje se hubiera llegado a bufferizar ni a encolar — la reentrega posterior (reintento del
   * inbox) se descartaba en silencio como si ya estuviera atendida, perdiendo el mensaje del
   * cliente para siempre. Marcar solo tras el éxito acepta, a cambio, que un fallo a mitad de
   * turno pueda contar el rate limit dos veces en el reintento — preferible a perder el mensaje.
   */
  private async manejarMensajeEntrante(evento: Extract<EventoCanal, { tipo: 'mensaje-entrante' }>): Promise<void> {
    const conversacion = await this.repositorio.obtenerOCrear(
      Number(evento.conversacion.idExterno),
      evento.conversacion.idContactoExterno,
      evento.conversacion.canal,
    );

    const yaProcesado = await this.marcaMensajeProcesado.estaProcesado(evento.idMensaje);
    if (yaProcesado) return;

    await this.procesarTrasVerificaciones(conversacion, evento);
    await this.marcaMensajeProcesado.marcarSiEsPrimeraVez(evento.idMensaje);
  }

  /**
   * Trabajo protegido por la marca de idempotencia (judgment-day ronda 2): interruptor, rate
   * limit, aviso único de espera en `handoff_pendiente` y buffer/debounce del turno. Retorna
   * normalmente en cada uno de sus caminos de salida anticipada (CNV4, R13, CNV3, `estado !==
   * 'bot'`) y solo lanza ante un fallo real de una dependencia; `manejarMensajeEntrante` solo
   * marca el mensaje como procesado si esta llamada termina sin lanzar.
   */
  private async procesarTrasVerificaciones(
    conversacion: Conversacion,
    evento: Extract<EventoCanal, { tipo: 'mensaje-entrante' }>,
  ): Promise<void> {
    const activo = await this.interruptor.estaActivo();
    if (!activo) return;

    const dentroDelLimite = await this.contadorRateLimit.verificarLimite(conversacion.contactoId);
    if (!dentroDelLimite) return;

    if (conversacion.estado === 'humano' || conversacion.estado === 'handoff_pendiente') {
      await this.registrarEsperaDelCliente(conversacion);
    }
    if (conversacion.estado === 'handoff_pendiente') {
      await this.avisarEsperaSiCorresponde(conversacion);
      return;
    }
    if (conversacion.estado !== 'bot') return;

    // CNV7/D2: solo un mensaje de texto se lee de Chatwoot; para los demás tipos el texto va vacío y
    // el tipo viaja en el buffer para que el generador decida qué hacer con él.
    const texto =
      evento.tipoContenido === 'texto'
        ? await this.lectorMensaje.obtenerTexto(evento.conversacion.idExterno, evento.idMensaje)
        : null;
    const mensaje: MensajeTurno = {
      idMensaje: evento.idMensaje,
      tipoContenido: evento.tipoContenido,
      texto: texto ?? '',
    };
    await this.buffer.push(conversacion.id, JSON.stringify(mensaje));
    await this.colaTurno.encolarConDebounce(conversacion.id);
  }

  /**
   * CNV12 (Fase 08d): un mensaje del cliente bajo control humano deja constancia de que espera respuesta, con el instante
   * del primero sin contestar y sin guardar su contenido (R14). Es de apoyo: si el almacén falla, el mensaje sigue su
   * camino y solo queda un `warn`; nunca se pierde ni se reintenta por esto.
   */
  private async registrarEsperaDelCliente(conversacion: Conversacion): Promise<void> {
    try {
      await this.marcaEsperaCliente.registrar(conversacion.id, this.clock.ahora());
    } catch (error) {
      this.logger.warn({
        evento: 'conversaciones.espera-cliente-registro-fallo',
        error: error instanceof Error ? error.name : 'desconocido',
      });
    }
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

    const mensajeEspera = await this.textos.textoDelSistema('mensaje_espera_handoff');
    await this.salidaCanal.enviarMensajes({
      idConversacion: String(conversacion.chatwootConversationId),
      idRespuesta: `espera-handoff-${conversacion.id}`,
      requiereEstado: 'handoff_pendiente', // CNV9: si un asesor la toma antes de publicarse, no sale
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
