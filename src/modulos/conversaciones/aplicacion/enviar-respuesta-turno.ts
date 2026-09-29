import { Inject, Injectable } from '@nestjs/common';
import { SALIDA_CANAL, type SalidaCanal } from '../../canales/index.js';
import {
  REPOSITORIO_CONVERSACION,
  type RepositorioConversacion,
} from '../puertos/repositorio-conversacion.js';
import type {
  EnviarRespuestaTurno as PuertoEnviarRespuestaTurno,
  PasoRespuesta,
} from '../puertos/salida-conversacion.js';

/**
 * Punto único de salida del turno (**R5**, D10 de `design.md`): relee el estado de la conversación
 * (lectura fresca, no la del inicio del turno) justo antes de encolar en `SALIDA_CANAL`; si no es
 * `bot`, no envía nada (y cada paso vuelve a comprobarlo al publicarse: CNV9) — cubre tanto un eco humano recibido mientras el generador corría (capa 3 de
 * R8) como cualquier otra transición que haya sacado la conversación de `bot` en el ínterin.
 * `modulos/conversaciones` es el único módulo que importa `SALIDA_CANAL` (regla de fronteras nueva,
 * T6).
 */
@Injectable()
export class EnviarRespuestaTurno implements PuertoEnviarRespuestaTurno {
  constructor(
    @Inject(REPOSITORIO_CONVERSACION) private readonly repositorio: RepositorioConversacion,
    @Inject(SALIDA_CANAL) private readonly salidaCanal: SalidaCanal,
  ) {}

  async enviar(
    idConversacion: string,
    idRespuesta: string,
    pasos: readonly PasoRespuesta[],
    conHandoff = false,
  ): Promise<void> {
    if (pasos.length === 0) return; // CNV8: una respuesta sin pasos no encola nada
    const conversacion = await this.repositorio.obtenerPorId(idConversacion);
    if (conversacion === null || conversacion.estado !== 'bot') {
      return;
    }

    await this.salidaCanal.enviarMensajes({
      idConversacion: String(conversacion.chatwootConversationId),
      idRespuesta,
      // CNV9: la guardia relee el estado antes de publicar cada paso. Un handoff transiciona a
      // `handoff_pendiente` tras encolar: su propio mensaje no puede quedar bloqueado por eso.
      requiereEstado: conHandoff ? 'bot|handoff_pendiente' : 'bot',
      mensajes: pasos.map((paso) => ({ tipo: 'texto' as const, texto: paso.texto })),
    });
  }
}
