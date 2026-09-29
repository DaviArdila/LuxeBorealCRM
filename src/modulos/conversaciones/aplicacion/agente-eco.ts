import { Injectable } from '@nestjs/common';
import type { GeneradorRespuesta, RespuestaTurno, SolicitudTurno } from '../puertos/generador-respuesta.js';

/**
 * *Stand-in* del puerto {@link GeneradorRespuesta} (D9, CNV6): reenvía el texto del último mensaje
 * de tipo texto del turno como único paso, sin `handoff`. Es el generador por defecto de
 * `ConversacionesModule` para sus propios tests; la aplicación completa usa el del módulo `agente`
 * (ADR-0016).
 */
@Injectable()
export class AgenteEco implements GeneradorRespuesta {
  generar(solicitud: SolicitudTurno): Promise<RespuestaTurno> {
    const ultimoTexto = solicitud.mensajes.filter((mensaje) => mensaje.tipoContenido === 'texto').at(-1);
    return Promise.resolve({ pasos: [{ paso: 'eco-1', tipo: 'texto', texto: ultimoTexto?.texto ?? '' }] });
  }
}
