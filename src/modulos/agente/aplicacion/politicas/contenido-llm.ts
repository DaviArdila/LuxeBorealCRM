import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PasoRespuesta, RespuestaTurno, SolicitudTurno } from '../../../conversaciones/index.js';
import { ObtenerMensajeTechoGasto } from '../../../llm/index.js';
import { contarMontosSinRastro } from '../../dominio/auditar-dinero.js';
import type { EfectoTurno } from '../../dominio/efectos.js';
import type { DecisionPolitica, PoliticaTurno } from '../../dominio/politica-turno.js';
import { textoDelCliente } from '../../dominio/texto-del-cliente.js';
import {
  REPOSITORIO_PARAMETRO_AGENTE,
  type RepositorioParametroAgente,
} from '../../puertos/repositorio-parametro-agente.js';
import { BucleHerramientas, type MotivoDerivacionBucle } from '../bucle-herramientas.js';
import { EnsamblarPrompt } from '../ensamblar-prompt.js';

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
    @Inject(REPOSITORIO_PARAMETRO_AGENTE) private readonly parametros: RepositorioParametroAgente,
    private readonly mensajeTechoGasto: ObtenerMensajeTechoGasto,
  ) {}

  async evaluar(solicitud: SolicitudTurno): Promise<DecisionPolitica> {
    const textoCliente = textoDelCliente(solicitud.mensajes);
    if (textoCliente.length === 0) {
      return { decision: 'responder', respuesta: { pasos: [] }, cuentaTurno: false };
    }

    const { conversacionId, contactoId, version } = solicitud.contexto;
    const resultado = await this.bucle.ejecutar({
      sesion: { conversacionId, version },
      contactoId,
      systemPrompt: this.prompt.ensamblar(),
      mensajes: [{ rol: 'usuario', texto: textoCliente }],
    });

    if (resultado.tipo === 'derivar') {
      return {
        decision: 'responder',
        respuesta: await this.derivar(resultado.motivo),
        cuentaTurno: false,
      };
    }

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
