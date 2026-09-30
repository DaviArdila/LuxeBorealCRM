import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PasoRespuesta, RespuestaTurno, SolicitudTurno } from '../../../conversaciones/index.js';
import { CONFIGURACION, type Configuracion } from '../../../../plataforma/config/index.js';
import { ObtenerMensajeTechoGasto } from '../../../llm/index.js';
import { contarMontosSinRastro } from '../../dominio/auditar-dinero.js';
import type { EfectoTurno } from '../../dominio/efectos.js';
import type { DecisionPolitica, PoliticaTurno } from '../../dominio/politica-turno.js';
import { textoDelCliente } from '../../dominio/texto-del-cliente.js';
import { HISTORIAL_CONVERSACION, type HistorialConversacion } from '../../puertos/historial-conversacion.js';
import {
  REPOSITORIO_PARAMETRO_AGENTE,
  type RepositorioParametroAgente,
} from '../../puertos/repositorio-parametro-agente.js';
import { BucleHerramientas, type MotivoDerivacionBucle } from '../bucle-herramientas.js';
import { ArmarContextoInicial } from '../armar-contexto-inicial.js';
import { EnsamblarPrompt } from '../ensamblar-prompt.js';
import { TextoHandoff } from '../texto-handoff.js';

function pasosDeImagen(efectos: readonly EfectoTurno[]): PasoRespuesta[] {
  const pasos: PasoRespuesta[] = [];
  for (const efecto of efectos) {
    if (efecto.tipo === 'enviar-imagen') {
      pasos.push({
        paso: `llm-img-${String(pasos.length + 1)}`,
        tipo: 'imagen',
        claveObjeto: efecto.claveObjeto,
        ...(efecto.leyenda === undefined ? {} : { leyenda: efecto.leyenda }),
      });
    }
  }
  return pasos;
}

/**
 * Última política del pipeline (D1 de la Fase 07b, reemplaza al eco de la 07a): arma el prompt,
 * delega en el bucle de herramientas y traduce su resultado a pasos de respuesta. Un texto final
 * consume turno; cualquier derivación (fallo, techo, argumentos inválidos, plazo) responde con el
 * texto de cortesía del negocio (R15) y pide el handoff, que `conversaciones` ejecuta (R6).
 */
@Injectable()
export class ContenidoLlm implements PoliticaTurno {
  private readonly logger = new Logger(ContenidoLlm.name);

  constructor(
    private readonly bucle: BucleHerramientas,
    private readonly prompt: EnsamblarPrompt,
    private readonly contextoInicial: ArmarContextoInicial,
    @Inject(REPOSITORIO_PARAMETRO_AGENTE) private readonly parametros: RepositorioParametroAgente,
    private readonly mensajeTechoGasto: ObtenerMensajeTechoGasto,
    @Inject(HISTORIAL_CONVERSACION) private readonly historial: HistorialConversacion,
    @Inject(CONFIGURACION) private readonly configuracion: Pick<Configuracion, 'AGENTE_HISTORIAL_TURNOS'>,
    private readonly textoHandoff: TextoHandoff,
  ) {}

  async evaluar(solicitud: SolicitudTurno): Promise<DecisionPolitica> {
    const textoCliente = textoDelCliente(solicitud.mensajes);
    if (textoCliente.length === 0) {
      return { decision: 'responder', respuesta: { pasos: [] }, cuentaTurno: false };
    }

    const { conversacionId, contactoId, version } = solicitud.contexto;
    const sesion = { conversacionId, version };
    const prompt = await this.prompt.ensamblar({
      instruccionesTurno: await this.contextoInicial.ejecutar({ sesion, contactoId, textoCliente }),
    });
    // AGT13: solo la versión del prompt al log, nunca su contenido (R14).
    this.logger.log({ evento: 'agente.prompt', version: prompt.version });
    const previos = await this.historial.leer(sesion, this.configuracion.AGENTE_HISTORIAL_TURNOS);
    const resultado = await this.bucle.ejecutar({
      sesion,
      contactoId,
      systemPrompt: prompt.texto,
      mensajes: [
        ...previos.map((turno) => ({ rol: turno.rol, texto: turno.texto })),
        { rol: 'usuario', texto: textoCliente },
      ],
    });

    if (resultado.tipo === 'derivar') {
      return {
        decision: 'responder',
        respuesta: await this.derivar(resultado.motivo),
        cuentaTurno: false,
      };
    }

    // D4 de la Fase 08: la escala confirmó y hay asesores disponibles → el turno termina en handoff con el
    // texto del negocio, no con lo que escribió el modelo (que no conoce el estado). Un turno derivado no
    // entra al historial: tras el handoff la sesión bot termina.
    if (resultado.efectos.some((efecto) => efecto.tipo === 'lead-derivado')) {
      return {
        decision: 'responder',
        respuesta: {
          pasos: [{ paso: 'handoff-1', tipo: 'texto', texto: await this.textoHandoff.obtener() }],
          handoff: { motivo: 'lead-caliente' },
        },
        cuentaTurno: false,
      };
    }
    // AGT7: solo un turno que terminó con texto final entra al historial, y solo los dos textos.
    await this.historial.agregar(sesion, textoCliente, resultado.texto);
    const montos = contarMontosSinRastro(resultado.texto, resultado.resultadosParaElModelo);
    if (montos > 0) {
      // D9, R14: solo la cantidad; el texto de la respuesta nunca va al log.
      this.logger.warn({ evento: 'agente.dinero-sin-rastro', montos });
    }
    return {
      decision: 'responder',
      respuesta: {
        pasos: [{ paso: 'llm-1', tipo: 'texto', texto: resultado.texto }, ...pasosDeImagen(resultado.efectos)],
      },
      cuentaTurno: true,
    };
  }

  private async derivar(motivo: MotivoDerivacionBucle): Promise<RespuestaTurno> {
    const texto =
      motivo === 'techo-gasto'
        ? await this.mensajeTechoGasto.ejecutar()
        : await this.parametros.obtenerTexto('mensaje_error_llm');
    return { pasos: [{ paso: 'handoff-1', tipo: 'texto', texto }], handoff: { motivo } };
  }
}
