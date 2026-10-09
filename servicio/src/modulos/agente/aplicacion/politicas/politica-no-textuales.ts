import { Inject, Injectable } from '@nestjs/common';
import type { RespuestaTurno, SolicitudTurno } from '../../../conversaciones/index.js';
import { decidirAudio, decidirNoTextuales } from '../../dominio/decidir-no-textuales.js';
import type { DecisionPolitica, PoliticaTurno } from '../../dominio/politica-turno.js';
import { CONTADORES_SESION, type ContadoresSesion } from '../../puertos/contadores-sesion.js';
import { TEXTOS_ASISTENTE, type ClaveSistema, type TextosAsistente } from '../../../asistente/index.js';

function responderTexto(paso: string, texto: string, extra?: Pick<RespuestaTurno, 'aviso'>): DecisionPolitica {
  return {
    decision: 'responder',
    respuesta: { pasos: [{ paso, tipo: 'texto', texto }], ...extra },
    cuentaTurno: true,
  };
}

/**
 * R12 (D6 de la Fase 07a): primera política del pipeline. Aplica la tabla de `decidirNoTextuales` al
 * turno completo y, si no es texto, responde con textos que salen de `parametro` (AGT3, R15) sin
 * llegar al LLM. Un audio repetido en la misma sesión vuelve a pedir texto y pide avisar al asesor con el motivo
 * `audio-repetido`; la conversación sigue en `bot` (CNV13).
 */
@Injectable()
export class PoliticaNoTextuales implements PoliticaTurno {
  constructor(
    @Inject(CONTADORES_SESION) private readonly contadores: ContadoresSesion,
    @Inject(TEXTOS_ASISTENTE) private readonly textos: TextosAsistente,
  ) {}

  async evaluar(solicitud: SolicitudTurno): Promise<DecisionPolitica> {
    const { conversacionId, version } = solicitud.contexto;
    const sesion = { conversacionId, version };
    const decision = decidirNoTextuales(solicitud.mensajes.map((mensaje) => mensaje.tipoContenido));

    switch (decision.accion) {
      case 'seguir':
        if (decision.reiniciaAudios) {
          await this.contadores.reiniciarAudios(sesion);
        }
        return { decision: 'seguir' };
      case 'ignorar':
        return { decision: 'responder', respuesta: { pasos: [] }, cuentaTurno: false };
      case 'imagen':
        return responderTexto('imagen-1', await this.texto('mensaje_imagen_no_procesada'));
      case 'audio': {
        const cuenta = await this.contadores.sumarAudio(sesion);
        const texto = await this.texto('mensaje_pedir_texto_audio');
        if (decidirAudio(cuenta) === 'pedir-texto') {
          return responderTexto('audio-1', texto);
        }
        return responderTexto('audio-1', texto, { aviso: { motivo: 'audio-repetido' } });
      }
    }
  }

  private texto(clave: ClaveSistema): Promise<string> {
    return this.textos.textoDelSistema(clave);
  }
}
