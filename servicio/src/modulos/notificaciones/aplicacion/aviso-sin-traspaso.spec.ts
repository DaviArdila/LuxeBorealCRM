import { describe, expect, it } from 'vitest';
import type { EventoAviso } from '../../conversaciones/index.js';
import { AvisoSinTraspaso } from './aviso-sin-traspaso.js';
import type { EntradaAviso } from './encolar-aviso.js';
import type { ResolverEnlaceConversacion } from './resolver-enlace-conversacion.js';

// Escenarios NTF8 de `openspec/changes/fase-12d-derivar-sin-silencio/specs/notificaciones/spec.md`.

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
  return { caso: new AvisoSinTraspaso(encolar as never, resolver), encolar };
}

function evento(motivo: EventoAviso['motivo'], version = 0, conversacionId = 'conv-1'): EventoAviso {
  return { conversacionId, contactoId: 'contacto-1', motivo, version };
}

describe('AvisoSinTraspaso (NTF8)', () => {
  it.each(['pide-persona', 'pide-asesor', 'audio-repetido'] as const)(
    'NTF8 — el aviso %s encola un aviso sin traspaso con su motivo y el enlace',
    async (motivo) => {
      const { caso, encolar } = armar();

      await caso.alAvisarAsesor(evento(motivo));

      expect(encolar.avisos).toHaveLength(1);
      expect(encolar.avisos[0]?.aviso).toEqual({ tipo: 'aviso', motivo, enlace: ENLACE });
      expect(encolar.avisos[0]?.grupo).toBe('conversacion:conv-1');
    },
  );

  it('NTF8 — lead-caliente lo avisa el camino de leads (R11), no este', async () => {
    const { caso, encolar } = armar();

    await caso.alAvisarAsesor(evento('lead-caliente'));

    expect(encolar.avisos).toEqual([]);
  });

  it('NTF8 — Un segundo aviso del mismo motivo no se encola: pide-persona y pide-asesor comparten clave', async () => {
    const { caso, encolar } = armar();

    await caso.alAvisarAsesor(evento('pide-persona', 3));
    await caso.alAvisarAsesor(evento('pide-asesor', 3));

    expect(encolar.avisos[0]?.claveIdempotencia).toBe('aviso:conv-1:3:pide-persona');
    expect(encolar.avisos[1]?.claveIdempotencia).toBe(encolar.avisos[0]?.claveIdempotencia);
  });

  it('NTF8 — Un aviso de otro motivo sí se encola: otra clave y su propio texto', async () => {
    const { caso, encolar } = armar();

    await caso.alAvisarAsesor(evento('pide-persona', 3));
    await caso.alAvisarAsesor(evento('audio-repetido', 3));

    expect(encolar.avisos[1]?.claveIdempotencia).toBe('aviso:conv-1:3:audio-repetido');
    expect(encolar.avisos[1]?.aviso).toMatchObject({ motivo: 'audio-repetido' });
  });

  it('NTF8 — Pasada la toma del asesor se puede avisar otra vez: otra versión, otra clave', async () => {
    const { caso, encolar } = armar();

    await caso.alAvisarAsesor(evento('pide-asesor', 3));
    await caso.alAvisarAsesor(evento('pide-asesor', 5));

    expect(new Set(encolar.avisos.map((a) => a.claveIdempotencia)).size).toBe(2);
  });

  it('NTF8 — Fuera de horario el aviso también sale: el observador no consulta ningún horario', async () => {
    const { caso, encolar } = armar();

    await caso.alAvisarAsesor(evento('pide-asesor'));

    expect(encolar.avisos).toHaveLength(1);
  });

  it('NTF5 — sin enlace el aviso sale igual, sin la propiedad', async () => {
    const { caso, encolar } = armar(null);

    await caso.alAvisarAsesor(evento('pide-persona'));

    expect('enlace' in (encolar.avisos[0]?.aviso ?? {})).toBe(false);
  });

  it('NTF8 — Un fallo del encolado sube, para que el registro libere la marca del motivo', async () => {
    const { caso, encolar } = armar();
    encolar.fallar = true;

    await expect(caso.alAvisarAsesor(evento('pide-persona'))).rejects.toThrow('outbox caído');
  });
});
