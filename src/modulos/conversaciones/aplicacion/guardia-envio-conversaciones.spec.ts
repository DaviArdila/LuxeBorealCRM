import type { Conversacion, RepositorioConversacion } from '../puertos/repositorio-conversacion.js';
import { GuardiaEnvioConversaciones } from './guardia-envio-conversaciones.js';

function repositorioCon(conversacion: Conversacion | null): RepositorioConversacion {
  return { obtenerPorConversacionCanal: () => Promise.resolve(conversacion) } as unknown as RepositorioConversacion;
}

function conversacionEn(estado: Conversacion['estado']): Conversacion {
  return {
    id: 'conv-1',
    contactoId: 'contacto-1',
    chatwootConversationId: 42,
    canal: 'whatsapp',
    estado,
    expiraControlEn: null,
    version: 0,
  };
}

describe('modulos/conversaciones/aplicacion — GuardiaEnvioConversaciones (CNV9, D7)', () => {
  it('permite enviar cuando la conversación sigue en el estado requerido', async () => {
    const guardia = new GuardiaEnvioConversaciones(repositorioCon(conversacionEn('bot')));

    await expect(guardia.puedeEnviar('42', 'bot')).resolves.toBe(true);
  });

  it.each(['humano', 'handoff_pendiente', 'pausado'] as const)(
    'CNV9 — niega el paso de un turno cuando la conversación pasó a %s',
    async (estado) => {
      const guardia = new GuardiaEnvioConversaciones(repositorioCon(conversacionEn(estado)));

      await expect(guardia.puedeEnviar('42', 'bot')).resolves.toBe(false);
    },
  );

  it('CNV9 — el aviso de espera solo sale mientras la conversación sigue en handoff_pendiente', async () => {
    const esperando = new GuardiaEnvioConversaciones(repositorioCon(conversacionEn('handoff_pendiente')));
    const tomada = new GuardiaEnvioConversaciones(repositorioCon(conversacionEn('humano')));

    await expect(esperando.puedeEnviar('42', 'handoff_pendiente')).resolves.toBe(true);
    await expect(tomada.puedeEnviar('42', 'handoff_pendiente')).resolves.toBe(false);
  });

  it.each([
    ['bot', true],
    ['handoff_pendiente', true],
    ['humano', false],
  ] as const)(
    'CNV9 — un mensaje de handoff admite bot y handoff_pendiente: en %s => %s',
    async (estado, esperado) => {
      const guardia = new GuardiaEnvioConversaciones(repositorioCon(conversacionEn(estado)));

      await expect(guardia.puedeEnviar('42', 'bot|handoff_pendiente')).resolves.toBe(esperado);
    },
  );

  it('niega el envío si la conversación ya no existe', async () => {
    const guardia = new GuardiaEnvioConversaciones(repositorioCon(null));

    await expect(guardia.puedeEnviar('42', 'bot')).resolves.toBe(false);
  });
});
