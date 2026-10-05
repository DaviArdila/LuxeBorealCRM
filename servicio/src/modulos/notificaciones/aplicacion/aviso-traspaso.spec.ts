import { describe, expect, it } from 'vitest';
import type { EventoHandoff } from '../../conversaciones/index.js';
import type { EntradaAviso } from './encolar-aviso.js';
import { AvisoTraspaso } from './aviso-traspaso.js';
import type { ResolverEnlaceConversacion } from './resolver-enlace-conversacion.js';

// Escenarios NTF6 y NTF2 (límite por instancia) de
// `openspec/changes/fase-08d-avisos-con-enlace/specs/notificaciones/spec.md`.

const ENLACE = 'https://chat.ejemplo.co/app/accounts/1/conversations/2';

class EncolarAvisoFalso {
  readonly avisos: EntradaAviso[] = [];
  fallar = false;
  ejecutar(entrada: EntradaAviso): Promise<void> {
    if (this.fallar) return Promise.reject(new Error('outbox caído'));
    this.avisos.push(entrada);
    return Promise.resolve();
  }
}

function armar(enlace: string | null = ENLACE) {
  const encolar = new EncolarAvisoFalso();
  const resolver = { ejecutar: () => Promise.resolve(enlace ?? undefined) } as unknown as ResolverEnlaceConversacion;
  const caso = new AvisoTraspaso(encolar as never, resolver);
  return { caso, encolar };
}

function evento(motivo: EventoHandoff['motivo'], version = 0, conversacionId = 'conv-1'): EventoHandoff {
  return { conversacionId, contactoId: 'contacto-1', motivo, version };
}

const MOTIVOS_SIN_LEAD = [
  'tope-turnos',
  'fallo-llm',
  'techo-gasto',
  'audio-repetido',
  'argumentos-invalidos',
  'plazo-agotado',
] as const;

describe('AvisoTraspaso (NTF6)', () => {
  it.each(MOTIVOS_SIN_LEAD)('NTF6 — el traspaso por %s encola un aviso con su motivo y el enlace', async (motivo) => {
    const { caso, encolar } = armar();

    await caso.alConfirmarHandoff(evento(motivo));

    expect(encolar.avisos).toHaveLength(1);
    expect(encolar.avisos[0]?.aviso).toEqual({ tipo: 'traspaso', motivo, enlace: ENLACE });
  });

  it.each(['lead-caliente', 'pide-persona'] as const)(
    'NTF6 — el motivo %s lo avisa el camino de leads, no este',
    async (motivo) => {
      const { caso, encolar } = armar();

      await caso.alConfirmarHandoff(evento(motivo));

      expect(encolar.avisos).toEqual([]);
    },
  );

  it('NTF6 — la clave de idempotencia lleva la conversación, la versión y el motivo', async () => {
    const { caso, encolar } = armar();

    await caso.alConfirmarHandoff(evento('tope-turnos', 4, 'conv-9'));

    expect(encolar.avisos[0]?.claveIdempotencia).toBe('traspaso:conv-9:4:tope-turnos');
    expect(encolar.avisos[0]?.grupo).toBe('conversacion:conv-9');
  });

  it('NTF6 — el mismo traspaso produce siempre la misma clave: el outbox no lo duplica', async () => {
    const { caso, encolar } = armar();

    await caso.alConfirmarHandoff(evento('fallo-llm', 2));
    await caso.alConfirmarHandoff(evento('fallo-llm', 2));

    expect(encolar.avisos[0]?.claveIdempotencia).toBe(encolar.avisos[1]?.claveIdempotencia);
  });

  it('NTF6 — un traspaso posterior, con otra versión de la conversación, tiene otra clave', async () => {
    const { caso, encolar } = armar();

    await caso.alConfirmarHandoff(evento('tope-turnos', 0));
    await caso.alConfirmarHandoff(evento('tope-turnos', 2));

    expect(new Set(encolar.avisos.map((a) => a.claveIdempotencia)).size).toBe(2);
  });

  it('NTF2 — dos motivos distintos de la misma conversación avisan los dos: no hay ventana por contacto', async () => {
    const { caso, encolar } = armar();

    await caso.alConfirmarHandoff(evento('audio-repetido', 0));
    await caso.alConfirmarHandoff(evento('techo-gasto', 0));

    expect(encolar.avisos).toHaveLength(2);
  });

  it('NTF5 — sin enlace el aviso sale igual, sin la propiedad', async () => {
    const { caso, encolar } = armar(null);

    await caso.alConfirmarHandoff(evento('plazo-agotado'));

    expect(encolar.avisos[0]?.aviso).toEqual({ tipo: 'traspaso', motivo: 'plazo-agotado' });
    expect('enlace' in (encolar.avisos[0]?.aviso ?? {})).toBe(false);
  });

  it('NTF4 — si el encolado falla el error sube, para que el registro lo anote sin revertir el handoff', async () => {
    const { caso, encolar } = armar();
    encolar.fallar = true;

    await expect(caso.alConfirmarHandoff(evento('tope-turnos'))).rejects.toThrow('outbox caído');
  });
});
