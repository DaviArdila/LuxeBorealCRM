import { Inject, Injectable } from '@nestjs/common';
import type { RespuestaTurno, SolicitudTurno } from '../../../conversaciones/index.js';
import { decidirAudio, decidirNoTextuales } from '../../dominio/decidir-no-textuales.js';
import type { DecisionPolitica, PoliticaTurno } from '../../dominio/politica-turno.js';
import { CONTADORES_SESION, type ContadoresSesion } from '../../puertos/contadores-sesion.js';
import {
  REPOSITORIO_PARAMETRO_AGENTE,
  type ClaveTextoAgente,
  type RepositorioParametroAgente,
} from '../../puertos/repositorio-parametro-agente.js';
import { TextoHandoff } from '../texto-handoff.js';

function responderTexto(paso: string, texto: string, extra?: Pick<RespuestaTurno, 'handoff'>): DecisionPolitica {
  return {
    decision: 'responder',
    respuesta: { pasos: [{ paso, tipo: 'texto', texto }], ...extra },
    cuentaTurno: true,
  };
}

/**
 * R12 (D6 de la Fase 07a): primera política del pipeline. Aplica la tabla de `decidirNoTextuales` al
 * turno completo y, si no es texto, responde con textos que salen de `parametro` (AGT3, R15) sin
 * llegar al LLM. Un audio repetido en la misma sesión pide handoff; conversaciones lo ejecuta (R6).
 */
@Injectable()
export class PoliticaNoTextuales implements PoliticaTurno {
  constructor(
    @Inject(CONTADORES_SESION) private readonly contadores: ContadoresSesion,
    @Inject(REPOSITORIO_PARAMETRO_AGENTE) private readonly parametros: RepositorioParametroAgente,
    private readonly textoHandoff: TextoHandoff,
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
        if (decidirAudio(cuenta) === 'pedir-texto') {
          return responderTexto('audio-1', await this.texto('mensaje_pedir_texto_audio'));
        }
        return responderTexto('handoff-1', await this.textoHandoff.obtener(), {
          handoff: { motivo: 'audio-repetido' },
        });
      }
    }
  }

  private texto(clave: ClaveTextoAgente): Promise<string> {
    return this.parametros.obtenerTexto(clave);
  }
}
