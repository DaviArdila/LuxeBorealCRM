import { describe, expect, it } from 'vitest';
import type { ObtenerReferenciaConversacion } from '../../conversaciones/index.js';
import { ResolverEnlaceConversacion } from './resolver-enlace-conversacion.js';

const CONFIG = {
  CHATWOOT_URL: 'http://localhost:3001',
  CHATWOOT_URL_PUBLICA: 'https://chat.ejemplo.co',
  CHATWOOT_ACCOUNT_ID: 1,
} as never;

function referencia(
  resultado: { chatwootConversationId: number } | null | Error,
): ObtenerReferenciaConversacion {
  return {
    ejecutar: () => (resultado instanceof Error ? Promise.reject(resultado) : Promise.resolve(resultado)),
  } as unknown as ObtenerReferenciaConversacion;
}

describe('ResolverEnlaceConversacion (NTF5)', () => {
  it('NTF5 — arma el enlace con el id de Chatwoot de la conversación', async () => {
    const caso = new ResolverEnlaceConversacion(referencia({ chatwootConversationId: 2 }), CONFIG);

    await expect(caso.ejecutar('conv-1')).resolves.toBe('https://chat.ejemplo.co/app/accounts/1/conversations/2');
  });

  it('NTF5 — sin identificador de Chatwoot no hay enlace', async () => {
    const caso = new ResolverEnlaceConversacion(referencia(null), CONFIG);

    await expect(caso.ejecutar('conv-1')).resolves.toBeUndefined();
  });

  it('NTF5 — un lead sin conversación no tiene enlace y no consulta nada', async () => {
    const caso = new ResolverEnlaceConversacion(referencia(new Error('no debía consultarse')), CONFIG);

    await expect(caso.ejecutar(null)).resolves.toBeUndefined();
  });

  it('NTF5 — si la consulta falla el aviso sale sin enlace, nunca se cae', async () => {
    const caso = new ResolverEnlaceConversacion(referencia(new Error('base caída')), CONFIG);

    await expect(caso.ejecutar('conv-1')).resolves.toBeUndefined();
  });
});
