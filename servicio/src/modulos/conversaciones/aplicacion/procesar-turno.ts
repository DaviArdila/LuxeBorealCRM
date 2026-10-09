import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { SALIDA_CANAL, type SalidaCanal } from '../../canales/index.js';
import { BufferTurno } from '../infraestructura/redis/buffer-turno.js';
import { LockTurno } from '../infraestructura/redis/lock-turno.js';
import type { OrigenTransicion } from '../dominio/maquina-estados.js';
import {
  GENERADOR_RESPUESTA,
  type ContextoTurno,
  type GeneradorRespuesta,
  type MensajeTurno,
  type MotivoAviso,
  type MotivoHandoff,
} from '../puertos/generador-respuesta.js';
import {
  MARCA_ASESOR_AVISADO,
  motivoDeMarca,
  type MarcaAsesorAvisado,
} from '../puertos/marca-asesor-avisado.js';
import {
  REPOSITORIO_CONVERSACION,
  type RepositorioConversacion,
} from '../puertos/repositorio-conversacion.js';
import { ENVIAR_RESPUESTA_TURNO, type EnviarRespuestaTurno } from '../puertos/salida-conversacion.js';
import { capacidadesTurno } from './capacidades-turno.js';
import { RegistroObservadoresAviso } from './registro-observadores-aviso.js';
import { RegistroObservadoresHandoff } from './registro-observadores-handoff.js';
import { ETIQUETA_LEAD_CALIENTE, TransicionarConversacion } from './transicionar-conversacion.js';

/**
 * Un mensaje del buffer escrito antes de la 07a (Redis durante un despliegue) no trae
 * `tipoContenido`: se lee como `texto`, que era lo único que el consumidor bufferizaba (D2).
 */
function leerMensajeDelBuffer(crudo: string): MensajeTurno {
  const mensaje = JSON.parse(crudo) as Omit<MensajeTurno, 'tipoContenido'> & Partial<Pick<MensajeTurno, 'tipoContenido'>>;
  return { ...mensaje, tipoContenido: mensaje.tipoContenido ?? 'texto' };
}

/**
 * CNV8, CNV11: `lead-caliente` es el único motivo con origen propio; el resto (audio repetido, tope de
 * turnos, `pide-persona`…) es una regla de handoff explícita.
 */
function origenDelHandoff(motivo: MotivoHandoff): OrigenTransicion {
  return motivo === 'lead-caliente' ? 'lead_caliente' : 'regla_handoff_explicita';
}

/**
 * Id de la respuesta a una ráfaga (D11 de la Fase 04): el outbox deduplica por `idRespuesta`, así que
 * el id del job (`turno-<conversación>`, igual en todos los turnos) haría que solo la primera respuesta
 * de una conversación saliera. Se deriva del job y del primer mensaje de la ráfaga: distinto por turno,
 * estable ante el mismo turno y dentro de `[A-Za-z0-9_-]{1,64}` aunque el id del job sea el de respaldo.
 */
function idRespuestaDeRafaga(idJob: string, mensajes: readonly MensajeTurno[]): string {
  const huella = createHash('sha256').update(`${idJob}|${mensajes[0]?.idMensaje ?? ''}`).digest('hex');
  return `turno-${huella.slice(0, 32)}`;
}

/** `reencolar: true` cuando no se pudo adquirir el lock y el buffer todavía tiene mensajes (D8). */
export interface ResultadoProcesarTurno {
  readonly reencolar: boolean;
}

/**
 * Orquesta el turno completo (D8 de `design.md`, reproduce `chatWorker.ts` del prototipo): adquiere
 * el lock (R8), drena el buffer en bucle mientras el estado siga `bot` (si no, lo vacía y termina
 * sin generar nada), invoca {@link GeneradorRespuesta} y entrega el resultado al punto único de
 * salida; si la respuesta pide `handoff`, ejecuta la transición a `handoff_pendiente` **después** de
 * enviar los pasos (CNV8, D3 de la 07a: el punto único de salida exige `bot`, así que el propio
 * mensaje de handoff saldría bloqueado si se transicionara antes) y termina el turno. No cancela el
 * job diferido: `ColaTurno` depende de este caso de uso (ciclo) y el único job posible es un
 * respaldo que, al correr, ve `estado !== 'bot'` y vacía el buffer. Si la respuesta pide `aviso` (sin handoff), avisa a los
 * observadores tras enviar los pasos, con una marca por motivo, y deja la conversación en `bot` (CNV13, CNV14). Libera el lock siempre, incluso si el generador o el envío lanzan. No conoce BullMQ: la
 * decisión de *cuándo* correr y de reencolar cuando el lock está ocupado es de `ColaTurno`
 * (infraestructura), que llama a {@link ejecutar} y actúa sobre el resultado — así se evita un
 * ciclo `aplicacion → infraestructura → aplicacion`.
 */
@Injectable()
export class ProcesarTurno {
  private readonly logger = new Logger(ProcesarTurno.name);

  constructor(
    private readonly lock: LockTurno,
    private readonly buffer: BufferTurno,
    @Inject(REPOSITORIO_CONVERSACION) private readonly repositorio: RepositorioConversacion,
    @Inject(GENERADOR_RESPUESTA) private readonly generador: GeneradorRespuesta,
    @Inject(ENVIAR_RESPUESTA_TURNO) private readonly enviarRespuestaTurno: EnviarRespuestaTurno,
    private readonly transicionarConversacion: TransicionarConversacion,
    private readonly observadoresHandoff: RegistroObservadoresHandoff,
    private readonly observadoresAviso: RegistroObservadoresAviso,
    @Inject(MARCA_ASESOR_AVISADO) private readonly marcaAsesorAvisado: MarcaAsesorAvisado,
    @Inject(SALIDA_CANAL) private readonly salidaCanal: SalidaCanal,
  ) {}

  async ejecutar(idConversacion: string, idRespuesta: string): Promise<ResultadoProcesarTurno> {
    const adquirido = await this.lock.adquirir(idConversacion);
    if (!adquirido) {
      const pendiente = (await this.buffer.tamano(idConversacion)) > 0;
      return { reencolar: pendiente };
    }

    try {
      await this.drenar(idConversacion, idRespuesta);
      return { reencolar: false };
    } finally {
      await this.lock.liberar(idConversacion);
    }
  }

  private async drenar(idConversacion: string, idRespuesta: string): Promise<void> {
    for (;;) {
      const conversacion = await this.repositorio.obtenerPorId(idConversacion);
      if (conversacion === null || conversacion.estado !== 'bot') {
        await this.buffer.vaciar(idConversacion);
        return;
      }

      const crudos = await this.buffer.leerYVaciar(idConversacion);
      if (crudos.length === 0) {
        return;
      }

      const mensajes = crudos.map(leerMensajeDelBuffer);
      const contexto: ContextoTurno = {
        conversacionId: conversacion.id,
        contactoId: conversacion.contactoId,
        canal: conversacion.canal,
        version: conversacion.version,
        capacidades: capacidadesTurno(conversacion.canal),
      };
      const respuesta = await this.generador.generar({ contexto, mensajes });
      if (respuesta.pasos.length > 0) {
        await this.enviarRespuestaTurno.enviar(
          idConversacion,
          idRespuestaDeRafaga(idRespuesta, mensajes),
          respuesta.pasos,
          respuesta.handoff !== undefined,
        );
      }
      if (respuesta.handoff !== undefined) {
        // CNV11: si la respuesta trae handoff y aviso, gana el handoff y el aviso se descarta.
        await this.ejecutarHandoff(idConversacion, respuesta.handoff.motivo);
        return;
      }
      if (respuesta.aviso !== undefined) {
        // CNV13: avisar no cambia el estado; el bucle sigue y el siguiente mensaje se atiende con normalidad.
        await this.ejecutarAviso(idConversacion, respuesta.aviso.motivo);
      }
    }
  }

  /**
   * CNV13, CNV14: relee la conversación (si un asesor la tomó mientras el generador corría no se avisa), adquiere la
   * marca del motivo de forma atómica y notifica a los observadores **después** de los pasos ya enviados. Si Redis
   * falla se avisa sin marca (mejor un aviso repetido que uno perdido); si un observador falla se libera la marca.
   */
  private async ejecutarAviso(idConversacion: string, motivo: MotivoAviso): Promise<void> {
    const fresca = await this.repositorio.obtenerPorId(idConversacion);
    if (fresca === null || fresca.estado !== 'bot') return;

    const motivoMarca = motivoDeMarca(motivo);
    let marcada = false;
    try {
      if (!(await this.marcaAsesorAvisado.adquirir(idConversacion, motivoMarca))) return;
      marcada = true;
    } catch (error) {
      this.logger.warn({
        evento: 'conversaciones.asesor-avisado-marca-fallo',
        error: error instanceof Error ? error.name : 'desconocido',
      });
    }

    if (motivo === 'lead-caliente') {
      await this.etiquetarLeadCaliente(fresca.chatwootConversationId, fresca.version);
    }
    const bien = await this.observadoresAviso.notificar({
      conversacionId: fresca.id,
      contactoId: fresca.contactoId,
      motivo,
      version: fresca.version,
    });
    if (!bien && marcada) {
      await this.liberarMarca(idConversacion, motivoMarca);
    }
  }

  /** CNV11: el asesor distingue el lead en la bandeja aunque no haya traspaso. Es de apoyo: un fallo solo deja un `warn`. */
  private async etiquetarLeadCaliente(chatwootConversationId: number, version: number): Promise<void> {
    try {
      await this.salidaCanal.agregarEtiquetas({
        idConversacion: String(chatwootConversationId),
        idOperacion: `etiqueta-lead-v${String(version)}`,
        etiquetas: [ETIQUETA_LEAD_CALIENTE],
      });
    } catch (error) {
      this.logger.warn({
        evento: 'conversaciones.etiqueta-lead-fallo',
        error: error instanceof Error ? error.name : 'desconocido',
      });
    }
  }

  private async liberarMarca(idConversacion: string, motivo: Parameters<MarcaAsesorAvisado['liberar']>[1]): Promise<void> {
    try {
      await this.marcaAsesorAvisado.liberar(idConversacion, motivo);
    } catch (error) {
      this.logger.warn({
        evento: 'conversaciones.asesor-avisado-liberacion-fallo',
        error: error instanceof Error ? error.name : 'desconocido',
      });
    }
  }

  /**
   * Relee la conversación: si un asesor la tomó mientras el generador corría (eco humano), no se la
   * pisa con `handoff_pendiente`. En cualquier caso el buffer se vacía — lo que llegó tarde ya lo
   * atiende una persona.
   */
  private async ejecutarHandoff(idConversacion: string, motivo: MotivoHandoff): Promise<void> {
    const fresca = await this.repositorio.obtenerPorId(idConversacion);
    if (fresca !== null && fresca.estado === 'bot') {
      await this.transicionarConversacion.ejecutar(fresca, 'handoff_pendiente', origenDelHandoff(motivo));
      // NTF3: los observadores (p. ej. el aviso del lead) corren solo tras confirmar la transición.
      await this.observadoresHandoff.notificar({
        conversacionId: fresca.id,
        contactoId: fresca.contactoId,
        motivo,
        version: fresca.version,
      });
    }
    await this.buffer.vaciar(idConversacion);
  }
}
