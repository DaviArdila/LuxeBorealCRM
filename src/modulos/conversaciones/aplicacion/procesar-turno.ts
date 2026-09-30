import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { BufferTurno } from '../infraestructura/redis/buffer-turno.js';
import { LockTurno } from '../infraestructura/redis/lock-turno.js';
import type { OrigenTransicion } from '../dominio/maquina-estados.js';
import {
  GENERADOR_RESPUESTA,
  type ContextoTurno,
  type GeneradorRespuesta,
  type MensajeTurno,
  type MotivoHandoff,
} from '../puertos/generador-respuesta.js';
import {
  REPOSITORIO_CONVERSACION,
  type RepositorioConversacion,
} from '../puertos/repositorio-conversacion.js';
import { ENVIAR_RESPUESTA_TURNO, type EnviarRespuestaTurno } from '../puertos/salida-conversacion.js';
import { capacidadesTurno } from './capacidades-turno.js';
import { TransicionarConversacion } from './transicionar-conversacion.js';

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
 * respaldo que, al correr, ve `estado !== 'bot'` y vacía el buffer. Libera el lock siempre, incluso si el generador o el envío lanzan. No conoce BullMQ: la
 * decisión de *cuándo* correr y de reencolar cuando el lock está ocupado es de `ColaTurno`
 * (infraestructura), que llama a {@link ejecutar} y actúa sobre el resultado — así se evita un
 * ciclo `aplicacion → infraestructura → aplicacion`.
 */
@Injectable()
export class ProcesarTurno {
  constructor(
    private readonly lock: LockTurno,
    private readonly buffer: BufferTurno,
    @Inject(REPOSITORIO_CONVERSACION) private readonly repositorio: RepositorioConversacion,
    @Inject(GENERADOR_RESPUESTA) private readonly generador: GeneradorRespuesta,
    @Inject(ENVIAR_RESPUESTA_TURNO) private readonly enviarRespuestaTurno: EnviarRespuestaTurno,
    private readonly transicionarConversacion: TransicionarConversacion,
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
        await this.ejecutarHandoff(idConversacion, respuesta.handoff.motivo);
        return;
      }
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
    }
    await this.buffer.vaciar(idConversacion);
  }
}
