import { describe, expect, it } from 'vitest';
import type { EventoAviso } from '../../conversaciones/index.js';
import type { AvisarLead } from './avisar-lead.js';
import { AvisoLeadEnAviso } from './aviso-lead-en-aviso.js';

class AvisarLeadFalso {
  readonly conversaciones: string[] = [];
  falla = false;
  ejecutar(conversacionId: string): Promise<'avisado'> {
    this.conversaciones.push(conversacionId);
    return this.falla ? Promise.reject(new Error('outbox caído')) : Promise.resolve('avisado');
  }
}

function evento(motivo: EventoAviso['motivo']): EventoAviso {
  return { conversacionId: 'conv-1', contactoId: 'c-1', motivo, version: 0 };
}

describe('AvisoLeadEnAviso (R11, NTF3, D4 de la Fase 12d)', () => {
  it('R11 — Un aviso lead-caliente encola el aviso del lead (ventana de 24 h por contacto) sin traspaso', async () => {
    const avisar = new AvisarLeadFalso();

    await new AvisoLeadEnAviso(avisar as unknown as AvisarLead).alAvisarAsesor(evento('lead-caliente'));

    expect(avisar.conversaciones).toEqual(['conv-1']);
  });

  it.each(['pide-persona', 'pide-asesor', 'audio-repetido'] as const)(
    'R11 — Un aviso por %s no es de un lead comercial: no lo avisa este camino',
    async (motivo) => {
      const avisar = new AvisarLeadFalso();

      await new AvisoLeadEnAviso(avisar as unknown as AvisarLead).alAvisarAsesor(evento(motivo));

      expect(avisar.conversaciones).toEqual([]);
    },
  );

  it('R11 — Si el encolado falla el error sube, para que conversaciones libere la marca del motivo', async () => {
    const avisar = new AvisarLeadFalso();
    avisar.falla = true;

    await expect(new AvisoLeadEnAviso(avisar as unknown as AvisarLead).alAvisarAsesor(evento('lead-caliente'))).rejects.toThrow(
      'outbox caído',
    );
  });
});
