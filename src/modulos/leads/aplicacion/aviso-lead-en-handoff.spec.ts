import { describe, expect, it } from 'vitest';
import type { EventoHandoff } from '../../conversaciones/index.js';
import type { AvisarLead } from './avisar-lead.js';
import { AvisoLeadEnHandoff } from './aviso-lead-en-handoff.js';

class AvisarLeadFalso {
  readonly conversaciones: string[] = [];
  ejecutar(conversacionId: string): Promise<'avisado'> {
    this.conversaciones.push(conversacionId);
    return Promise.resolve('avisado');
  }
}

function evento(motivo: EventoHandoff['motivo']): EventoHandoff {
  return { conversacionId: 'conv-1', contactoId: 'c-1', motivo };
}

describe('AvisoLeadEnHandoff (NTF3)', () => {
  it.each(['lead-caliente', 'pide-persona'] as const)('avisa cuando el handoff es por %s', async (motivo) => {
    const avisar = new AvisarLeadFalso();

    await new AvisoLeadEnHandoff(avisar as unknown as AvisarLead).alConfirmarHandoff(evento(motivo));

    expect(avisar.conversaciones).toEqual(['conv-1']);
  });

  it.each(['tope-turnos', 'fallo-llm', 'techo-gasto', 'audio-repetido'] as const)(
    'un handoff por %s no es de un lead: no avisa',
    async (motivo) => {
      const avisar = new AvisarLeadFalso();

      await new AvisoLeadEnHandoff(avisar as unknown as AvisarLead).alConfirmarHandoff(evento(motivo));

      expect(avisar.conversaciones).toEqual([]);
    },
  );
});
