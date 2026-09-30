import type { CambiosLead, Lead, NuevoLead } from '../../src/modulos/leads/dominio/lead.js';
import type { RepositorioLead } from '../../src/modulos/leads/puertos/repositorio-lead.js';

/** Doble de test de {@link RepositorioLead}: los leads en memoria, con el orden de creación a la vista. */
export class RepositorioLeadEnMemoria implements RepositorioLead {
  readonly leads: Lead[] = [];

  obtenerAbiertoDeConversacion(conversacionId: string): Promise<Lead | null> {
    return Promise.resolve(
      this.leads.find((lead) => lead.conversacionId === conversacionId && lead.estado === 'nuevo') ?? null,
    );
  }

  crear(nuevo: NuevoLead): Promise<Lead> {
    const lead: Lead = {
      id: crypto.randomUUID(),
      estado: 'nuevo',
      capturadoFueraHorario: false,
      notificadoEn: null,
      recordatorioEn: null,
      ...nuevo,
    };
    this.leads.push(lead);
    return Promise.resolve(lead);
  }

  actualizar(id: string, cambios: CambiosLead): Promise<Lead> {
    const indice = this.leads.findIndex((lead) => lead.id === id);
    const actual = this.leads[indice];
    if (actual === undefined) {
      return Promise.reject(new Error(`lead ${id} no existe`));
    }
    const actualizado: Lead = { ...actual, ...cambios };
    this.leads[indice] = actualizado;
    return Promise.resolve(actualizado);
  }
}
