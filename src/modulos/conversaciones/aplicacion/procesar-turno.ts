import { Inject, Injectable } from '@nestjs/common';
import { BufferTurno } from '../infraestructura/redis/buffer-turno.js';
import { LockTurno } from '../infraestructura/redis/lock-turno.js';
import { GENERADOR_RESPUESTA, type GeneradorRespuesta, type MensajeTurno } from '../puertos/generador-respuesta.js';
import {
  REPOSITORIO_CONVERSACION,
  type RepositorioConversacion,
} from '../puertos/repositorio-conversacion.js';
import { ENVIAR_RESPUESTA_TURNO, type EnviarRespuestaTurno } from '../puertos/salida-conversacion.js';

/** `reencolar: true` cuando no se pudo adquirir el lock y el buffer todavía tiene mensajes (D8). */
export interface ResultadoProcesarTurno {
  readonly reencolar: boolean;
}

/**
 * Orquesta el turno completo (D8 de `design.md`, reproduce `chatWorker.ts` del prototipo): adquiere
 * el lock (R8), drena el buffer en bucle mientras el estado siga `bot` (si no, lo vacía y termina
 * sin generar nada), invoca {@link GeneradorRespuesta} y entrega el resultado al punto único de
 * salida. Libera el lock siempre, incluso si el generador o el envío lanzan. No conoce BullMQ: la
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

      const mensajes = crudos.map((crudo) => JSON.parse(crudo) as MensajeTurno);
      const respuesta = await this.generador.generar(mensajes);
      await this.enviarRespuestaTurno.enviar(idConversacion, idRespuesta, respuesta.pasos);
    }
  }
}
