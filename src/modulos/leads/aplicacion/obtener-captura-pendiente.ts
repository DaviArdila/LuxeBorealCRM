import { Inject, Injectable } from '@nestjs/common';
import { evaluarEscala } from '../dominio/escala-lead.js';
import type { Lead } from '../dominio/lead.js';
import { REPOSITORIO_LEAD, type RepositorioLead } from '../puertos/repositorio-lead.js';
import { SENAL_PIDE_PERSONA } from './registrar-pide-persona.js';

/**
 * ¿El lead está esperando los datos del cliente? (D5 de la Fase 08, LDS4): un lead abierto, todavía no
 * derivado ni capturado, que la escala confirma o que nació de una petición de persona. Se calcula a
 * partir del lead: la captura no es un estado de la conversación, que sigue en `bot`.
 */
export function esCapturaPendiente(lead: Lead | null): lead is Lead {
  return (
    lead !== null &&
    !lead.derivado &&
    !lead.capturadoFueraHorario &&
    (evaluarEscala(lead.senales).confirma || lead.senales.includes(SENAL_PIDE_PERSONA))
  );
}

@Injectable()
export class ObtenerCapturaPendiente {
  constructor(@Inject(REPOSITORIO_LEAD) private readonly repositorio: RepositorioLead) {}

  async ejecutar(conversacionId: string): Promise<boolean> {
    return esCapturaPendiente(await this.repositorio.obtenerAbiertoDeConversacion(conversacionId));
  }
}
