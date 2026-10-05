import { Inject, Injectable } from '@nestjs/common';
import { HORARIO, type Horario } from '../../horario/index.js';
import { temperaturaMasAlta } from '../dominio/lead.js';
import { REPOSITORIO_LEAD, type RepositorioLead } from '../puertos/repositorio-lead.js';
import type { AccionLead } from './evaluar-propuesta-lead.js';

/** Señal propia de la petición explícita (R9): no está en el vocabulario de la escala porque no la evalúa. */
export const SENAL_PIDE_PERSONA = 'pide_persona';

export interface EntradaPidePersona {
  readonly conversacionId: string;
  readonly contactoId: string;
}

export interface ResultadoPidePersona {
  readonly accion: Exclude<AccionLead, 'ninguna'>;
  readonly leadId: string;
}

const RESUMEN = 'El cliente pidió hablar con una persona.';

/**
 * Registra el lead de una petición explícita de persona (D6 de la Fase 08, R9, LDS3): sin escala ni LLM,
 * la señal `pide_persona` basta. Crea o actualiza el lead abierto de la conversación con temperatura
 * `caliente` y lo deja derivado si hay asesores; fuera de horario queda pendiente de captura (LDS4). No
 * consulta la cobertura: pedir una persona no es un lead comercial que la cobertura pueda descartar.
 */
@Injectable()
export class RegistrarPidePersona {
  constructor(
    @Inject(REPOSITORIO_LEAD) private readonly repositorio: RepositorioLead,
    @Inject(HORARIO) private readonly horario: Horario,
  ) {}

  async ejecutar(entrada: EntradaPidePersona): Promise<ResultadoPidePersona> {
    const accion = (await this.horario.estaDentroDeHorario()) ? 'derivar' : 'capturar';
    const derivado = accion === 'derivar';
    const abierto = await this.repositorio.obtenerAbiertoDeConversacion(entrada.conversacionId);

    const lead =
      abierto === null
        ? await this.repositorio.crear({
            contactoId: entrada.contactoId,
            conversacionId: entrada.conversacionId,
            productoId: null,
            temperatura: 'caliente',
            senales: [SENAL_PIDE_PERSONA],
            resumen: RESUMEN,
            derivado,
          })
        : await this.repositorio.actualizar(abierto.id, {
            temperatura: temperaturaMasAlta(abierto.temperatura, 'caliente'),
            senales: [...new Set([...abierto.senales, SENAL_PIDE_PERSONA])],
            // Un lead ya derivado no se «des-deriva» si la petición llega fuera de horario.
            derivado: abierto.derivado || derivado,
          });
    return { accion, leadId: lead.id };
  }
}
