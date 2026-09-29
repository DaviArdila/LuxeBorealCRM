import { Injectable } from '@nestjs/common';
import type { SolicitudTurno } from '../../../conversaciones/index.js';
import type { DecisionPolitica, PoliticaTurno } from '../../dominio/politica-turno.js';

/**
 * Generación de contenido provisional de la Fase 07a (AGT1): reenvía el último mensaje de texto de la
 * ráfaga. La 07b lo reemplaza por el bucle del LLM sin tocar el resto del pipeline. Sin texto (todo
 * lo demás ya lo filtraron las políticas anteriores) responde sin pasos y sin consumir turno.
 */
@Injectable()
export class ContenidoEcoProvisional implements PoliticaTurno {
  evaluar(solicitud: SolicitudTurno): Promise<DecisionPolitica> {
    const ultimoTexto = solicitud.mensajes.filter((mensaje) => mensaje.tipoContenido === 'texto').at(-1);
    if (ultimoTexto === undefined) {
      return Promise.resolve({ decision: 'responder', respuesta: { pasos: [] }, cuentaTurno: false });
    }
    return Promise.resolve({
      decision: 'responder',
      respuesta: { pasos: [{ paso: 'eco-1', tipo: 'texto', texto: ultimoTexto.texto }] },
      cuentaTurno: true,
    });
  }
}
