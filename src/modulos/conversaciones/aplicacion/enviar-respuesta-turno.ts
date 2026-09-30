import { Inject, Injectable } from '@nestjs/common';
import { SALIDA_CANAL, type MensajeSaliente, type SalidaCanal } from '../../canales/index.js';
import type { CapacidadesSalida } from '../puertos/generador-respuesta.js';
import type { CanalConversacion } from '../puertos/repositorio-conversacion.js';
import { capacidadesTurno } from './capacidades-turno.js';
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
 * CNV10: un paso de imagen sale por el mismo punto, en su orden, salvo que el canal de la
 * conversación no admita imagen: entonces se omite sin enviar nada en su lugar.
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
    const admiteImagen = this.capacidades(conversacion.canal).admiteImagen;
    const mensajes = pasos.flatMap((paso): MensajeSaliente[] => {
      if (paso.tipo === 'texto') return [{ tipo: 'texto', texto: paso.texto }];
      if (!admiteImagen) return [];
      return [
        paso.leyenda === undefined
          ? { tipo: 'imagen', claveObjeto: paso.claveObjeto }
          : { tipo: 'imagen', claveObjeto: paso.claveObjeto, leyenda: paso.leyenda },
      ];
    });
    if (mensajes.length === 0) return;

    await this.salidaCanal.enviarMensajes({
      idConversacion: String(conversacion.chatwootConversationId),
      idRespuesta,
      // CNV9: la guardia relee el estado antes de publicar cada paso. Un handoff transiciona a
      // `handoff_pendiente` tras encolar: su propio mensaje no puede quedar bloqueado por eso.
      requiereEstado: conHandoff ? 'bot|handoff_pendiente' : 'bot',
      mensajes,
    });
  }

  /** Costura de prueba: ningún canal real declara hoy `admiteImagen: false` (perfil, CAN8). */
  protected capacidades(canal: CanalConversacion): CapacidadesSalida {
    return capacidadesTurno(canal);
  }
}
