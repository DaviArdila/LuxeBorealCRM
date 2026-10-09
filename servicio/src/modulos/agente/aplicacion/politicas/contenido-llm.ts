import { Inject, Injectable, Logger } from '@nestjs/common';
import type { MotivoAviso, PasoRespuesta, RespuestaTurno, SolicitudTurno } from '../../../conversaciones/index.js';
import { CONFIGURACION, type Configuracion } from '../../../../plataforma/config/index.js';
import { ObtenerMensajeTechoGasto } from '../../../llm/index.js';
import { asegurarMensajeLiteral } from '../../dominio/asegurar-mensaje-literal.js';
import type { EfectoTurno } from '../../dominio/efectos.js';
import { elegirAviso } from '../../dominio/prioridad-aviso.js';
import type { DecisionPolitica, EstadoTurno, PoliticaTurno } from '../../dominio/politica-turno.js';
import { textoDelCliente } from '../../dominio/texto-del-cliente.js';
import { HISTORIAL_CONVERSACION, type HistorialConversacion } from '../../puertos/historial-conversacion.js';
import { TEXTOS_ASISTENTE, type TextosAsistente } from '../../../asistente/index.js';
import { BucleHerramientas, type MotivoDerivacionBucle } from '../bucle-herramientas.js';
import { ArmarContextoInicial } from '../armar-contexto-inicial.js';
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
 * El aviso al asesor que pidió el turno, si alguna herramienta lo pidió (CNV13): no cambia el texto ni el estado. Con
 * varios gana el de mayor prioridad (D2 de la Fase 12d).
 */
function avisoDeEfectos(efectos: readonly EfectoTurno[]): RespuestaTurno['aviso'] {
  const motivos: MotivoAviso[] = efectos.flatMap((efecto) => (efecto.tipo === 'avisar-asesor' ? [efecto.motivo] : []));
  const motivo = elegirAviso(motivos);
  return motivo === undefined ? undefined : { motivo };
}

/**
 * Última política del pipeline (D1 de la Fase 07b, reemplaza al eco de la 07a): arma el prompt,
 * delega en el bucle de herramientas y traduce su resultado a pasos de respuesta. Un texto final
 * consume turno; cualquier derivación (fallo, techo, argumentos inválidos, plazo) responde con el
 * texto de cortesía del negocio (R15) y pide el handoff, que `conversaciones` ejecuta (R6). Un lead confirmado, una
 * petición de persona o un audio repetido ya no lo reemplazan: avisan al asesor y el texto del modelo sale (D2 de la Fase 12d).
 */
@Injectable()
export class ContenidoLlm implements PoliticaTurno {
  private readonly logger = new Logger(ContenidoLlm.name);

  constructor(
    private readonly bucle: BucleHerramientas,
    private readonly prompt: EnsamblarPrompt,
    private readonly contextoInicial: ArmarContextoInicial,
    @Inject(TEXTOS_ASISTENTE) private readonly textos: TextosAsistente,
    private readonly mensajeTechoGasto: ObtenerMensajeTechoGasto,
    @Inject(HISTORIAL_CONVERSACION) private readonly historial: HistorialConversacion,
    @Inject(CONFIGURACION) private readonly configuracion: Pick<Configuracion, 'AGENTE_HISTORIAL_TURNOS'>,
  ) {}

  async evaluar(solicitud: SolicitudTurno, turno: EstadoTurno = {}): Promise<DecisionPolitica> {
    const textoCliente = textoDelCliente(solicitud.mensajes);
    if (textoCliente.length === 0) {
      return { decision: 'responder', respuesta: { pasos: [] }, cuentaTurno: false };
    }

    const { conversacionId, contactoId, version } = solicitud.contexto;
    const sesion = { conversacionId, version };
    const prompt = await this.prompt.ensamblar({
      instruccionesTurno: await this.contextoInicial.ejecutar({
        sesion,
        contactoId,
        textoCliente,
        ...(turno.avisoPedido === undefined ? {} : { avisoPedido: turno.avisoPedido }),
      }),
    });
    // AGT13: solo las versiones del prompt y del estilo al log, nunca su contenido (R14).
    this.logger.log({ evento: 'agente.prompt', version: prompt.version, versionEstilo: prompt.versionEstilo });
    const previos = await this.historial.leer(sesion, this.configuracion.AGENTE_HISTORIAL_TURNOS);
    const resultado = await this.bucle.ejecutar({
      sesion,
      contactoId,
      systemPrompt: prompt.texto,
      textosDelCliente: [textoCliente],
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

    // AGT7: solo un turno que terminó con texto final entra al historial, y solo los dos textos.
    // R2: el mensaje de «sin cobertura» sale literal desde el backend, no parafraseado por el modelo.
    const texto = resultado.efectos.reduce(
      (acumulado, efecto) => (efecto.tipo === 'sin-cobertura' ? asegurarMensajeLiteral(acumulado, efecto.mensaje) : acumulado),
      resultado.texto,
    );
    await this.historial.agregar(sesion, textoCliente, texto);
    const aviso = avisoDeEfectos(resultado.efectos);
    return {
      decision: 'responder',
      respuesta: {
        pasos: [{ paso: 'llm-1', tipo: 'texto', texto }, ...pasosDeImagen(resultado.efectos)],
        ...(aviso === undefined ? {} : { aviso }),
      },
      cuentaTurno: true,
    };
  }

  private async derivar(motivo: MotivoDerivacionBucle): Promise<RespuestaTurno> {
    const texto =
      motivo === 'techo-gasto'
        ? await this.mensajeTechoGasto.ejecutar()
        : await this.textos.textoDelSistema('mensaje_error_llm');
    return { pasos: [{ paso: 'handoff-1', tipo: 'texto', texto }], handoff: { motivo: motivoDeHandoff(motivo) } };
  }
}

/**
 * `dinero-sin-rastro` es un motivo interno del agente: ante `conversaciones` y el aviso al asesor es un
 * fallo del bot (`fallo-llm`), el mismo traspaso con el texto de cortesía. Los demás motivos coinciden.
 */
function motivoDeHandoff(motivo: MotivoDerivacionBucle): Exclude<MotivoDerivacionBucle, 'dinero-sin-rastro'> {
  return motivo === 'dinero-sin-rastro' ? 'fallo-llm' : motivo;
}
