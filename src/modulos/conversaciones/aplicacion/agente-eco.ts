import { Injectable } from '@nestjs/common';
import type { GeneradorRespuesta, MensajeTurno, RespuestaTurno } from '../puertos/generador-respuesta.js';

/**
 * *Stand-in temporal* del puerto {@link GeneradorRespuesta} (D9, CNV6): reenvía el texto del
 * último mensaje del turno como único paso, sin `handoff`. La Fase 07 lo reemplaza por el motor
 * real; ningún otro módulo depende de esta clase.
 */
@Injectable()
export class AgenteEco implements GeneradorRespuesta {
  generar(mensajes: readonly MensajeTurno[]): Promise<RespuestaTurno> {
    const ultimo = mensajes.at(-1);
    return Promise.resolve({ pasos: [{ paso: 'eco-1', texto: ultimo?.texto ?? '' }] });
  }
}
