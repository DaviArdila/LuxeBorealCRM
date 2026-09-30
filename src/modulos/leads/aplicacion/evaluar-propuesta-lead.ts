import { Inject, Injectable } from '@nestjs/common';
import { HORARIO, type Horario } from '../../horario/index.js';
import { evaluarEscala } from '../dominio/escala-lead.js';
import { temperaturaMasAlta, type TemperaturaLead } from '../dominio/lead.js';
import { redactarResumen } from '../dominio/redactar-resumen.js';
import { REPOSITORIO_LEAD, type RepositorioLead } from '../puertos/repositorio-lead.js';

export interface EntradaPropuesta {
  readonly conversacionId: string;
  readonly contactoId: string;
  readonly temperatura: TemperaturaLead;
  readonly senales: readonly string[];
  readonly resumen: string;
  readonly productoId: string | null;
}

/** Qué hace el sistema con la propuesta: derivar ya, capturar datos primero (fuera de horario) o nada. */
export type AccionLead = 'derivar' | 'capturar' | 'ninguna';

export interface ResultadoPropuesta {
  readonly derivado: boolean;
  readonly accion: AccionLead;
  readonly leadId: string | null;
  readonly motivo?: string;
}

const MOTIVO_SIN_CONFIRMAR = 'Las señales aún no confirman intención de compra; sigue atendiendo al cliente.';
const MOTIVO_YA_DERIVADO = 'Este cliente ya fue derivado a un asesor; sigue atendiéndolo con normalidad.';
const MOTIVO_CAPTURAR =
  'Fuera del horario de atención: pídele al cliente su nombre completo, teléfono de contacto, dirección y ' +
  'localidad para que un asesor lo contacte, y guárdalos con guardar_datos_contacto.';

/**
 * Evalúa la propuesta del LLM con la escala determinista (D2 de la Fase 08, R9, LDS2): guarda o actualiza
 * el lead abierto de la conversación con las señales del vocabulario y un resumen redactado (R14), y decide
 * la acción. La temperatura que propone el modelo se guarda pero nunca decide. Un lead ya derivado no se
 * vuelve a derivar; fuera de horario un lead confirmado queda pendiente de captura (LDS4) en vez de derivarse.
 */
@Injectable()
export class EvaluarPropuestaLead {
  constructor(
    @Inject(REPOSITORIO_LEAD) private readonly repositorio: RepositorioLead,
    @Inject(HORARIO) private readonly horario: Horario,
  ) {}

  async ejecutar(entrada: EntradaPropuesta): Promise<ResultadoPropuesta> {
    const abierto = await this.repositorio.obtenerAbiertoDeConversacion(entrada.conversacionId);
    const senales = [...new Set([...(abierto?.senales ?? []), ...evaluarEscala(entrada.senales).validas])];
    const escala = evaluarEscala(senales);
    const resumen = redactarResumen(entrada.resumen);

    if (abierto?.derivado === true) {
      return { derivado: false, accion: 'ninguna', leadId: abierto.id, motivo: MOTIVO_YA_DERIVADO };
    }

    const dentroDeHorario = escala.confirma ? await this.horario.estaDentroDeHorario() : true;
    const accion: AccionLead = !escala.confirma ? 'ninguna' : dentroDeHorario ? 'derivar' : 'capturar';
    const derivado = accion === 'derivar';

    const lead =
      abierto === null
        ? await this.repositorio.crear({
            contactoId: entrada.contactoId,
            conversacionId: entrada.conversacionId,
            productoId: entrada.productoId,
            temperatura: entrada.temperatura,
            senales: escala.validas,
            resumen,
            derivado,
          })
        : await this.repositorio.actualizar(abierto.id, {
            temperatura: temperaturaMasAlta(abierto.temperatura, entrada.temperatura),
            senales: escala.validas,
            resumen,
            productoId: entrada.productoId ?? abierto.productoId,
            derivado,
          });

    return {
      derivado,
      accion,
      leadId: lead.id,
      ...(accion === 'ninguna' ? { motivo: MOTIVO_SIN_CONFIRMAR } : {}),
      ...(accion === 'capturar' ? { motivo: MOTIVO_CAPTURAR } : {}),
    };
  }
}
