import type { SolicitudTurno } from '../../src/modulos/conversaciones/index.js';
import type { DecisionPolitica, PoliticaTurno } from '../../src/modulos/agente/dominio/politica-turno.js';

/**
 * Doble de test de la última política del pipeline: reenvía el último mensaje de texto de la ráfaga.
 * Es lo que hacía el contenido provisional de la 07a; los tests de `MotorTurno` lo usan como contenido
 * fijo para probar el motor sin LLM.
 */
export class PoliticaEco implements PoliticaTurno {
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
