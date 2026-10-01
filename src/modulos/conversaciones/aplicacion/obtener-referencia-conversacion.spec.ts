import { describe, expect, it } from 'vitest';
import type { Conversacion, RepositorioConversacion } from '../puertos/repositorio-conversacion.js';
import { ObtenerReferenciaConversacion } from './obtener-referencia-conversacion.js';

const CONVERSACION: Conversacion = {
  id: 'conv-1',
  contactoId: 'contacto-1',
  chatwootConversationId: 42,
  canal: 'whatsapp',
  estado: 'humano',
  expiraControlEn: null,
  version: 3,
};

function repositorioCon(conversacion: Conversacion | null): RepositorioConversacion {
  return { obtenerPorId: () => Promise.resolve(conversacion) } as unknown as RepositorioConversacion;
}

describe('ObtenerReferenciaConversacion (D6 de la Fase 08d)', () => {
  it('devuelve el identificador de la conversación en Chatwoot', async () => {
    const caso = new ObtenerReferenciaConversacion(repositorioCon(CONVERSACION));

    await expect(caso.ejecutar('conv-1')).resolves.toEqual({ chatwootConversationId: 42 });
  });

  it('una conversación que no existe devuelve null', async () => {
    const caso = new ObtenerReferenciaConversacion(repositorioCon(null));

    await expect(caso.ejecutar('no-existe')).resolves.toBeNull();
  });

  it('solo expone el identificador de Chatwoot, nunca el contacto ni el estado', async () => {
    const caso = new ObtenerReferenciaConversacion(repositorioCon(CONVERSACION));

    const referencia = await caso.ejecutar('conv-1');

    expect(Object.keys(referencia ?? {})).toEqual(['chatwootConversationId']);
  });
});
