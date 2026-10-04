import { describe, expect, it } from 'vitest';
import type { EventoEsperaCliente } from '../../conversaciones/index.js';
import { AvisoEsperaCliente } from './aviso-espera-cliente.js';
import type { EntradaAviso } from './encolar-aviso.js';
import type { ResolverEnlaceConversacion } from './resolver-enlace-conversacion.js';

// Escenarios NTF7 y NTF2 (límite por instancia) de
// `openspec/changes/fase-08d-avisos-con-enlace/specs/notificaciones/spec.md`.

const ENLACE = 'https://chat.ejemplo.co/app/accounts/1/conversations/2';
const DESDE = new Date('2026-10-01T10:00:00Z');

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
  return { caso: new AvisoEsperaCliente(encolar as never, resolver), encolar };
}

function evento(sobrescribir: Partial<EventoEsperaCliente> = {}): EventoEsperaCliente {
  return { conversacionId: 'conv-1', contactoId: 'contacto-1', desde: DESDE, esperaMin: 11, ...sobrescribir };
}

describe('AvisoEsperaCliente (NTF7)', () => {
  it('NTF7 — encola un aviso de cliente esperando con los minutos y el enlace', async () => {
    const { caso, encolar } = armar();

    await caso.alEsperarCliente(evento());

    expect(encolar.avisos).toHaveLength(1);
    expect(encolar.avisos[0]?.aviso).toEqual({ tipo: 'espera', esperaMin: 11, enlace: ENLACE });
  });

  it('NTF7 — la clave de idempotencia es la conversación y el instante de la espera', async () => {
    const { caso, encolar } = armar();

    await caso.alEsperarCliente(evento());

    expect(encolar.avisos[0]?.claveIdempotencia).toBe(`espera:conv-1:${String(DESDE.getTime())}`);
    expect(encolar.avisos[0]?.grupo).toBe('conversacion:conv-1');
  });

  it('NTF7 — dos esperas distintas de la misma conversación tienen claves distintas', async () => {
    const { caso, encolar } = armar();

    await caso.alEsperarCliente(evento());
    await caso.alEsperarCliente(evento({ desde: new Date(DESDE.getTime() + 3_600_000) }));

    expect(new Set(encolar.avisos.map((a) => a.claveIdempotencia)).size).toBe(2);
  });

  it('NTF2 — no consulta ninguna ventana por contacto: avisa aunque el contacto ya fuera avisado por un lead', async () => {
    const { caso, encolar } = armar();

    await caso.alEsperarCliente(evento({ contactoId: 'contacto-ya-avisado' }));

    expect(encolar.avisos).toHaveLength(1);
  });

  it('NTF5 — sin enlace el aviso sale igual, sin la propiedad', async () => {
    const { caso, encolar } = armar(null);

    await caso.alEsperarCliente(evento());

    expect(encolar.avisos[0]?.aviso).toEqual({ tipo: 'espera', esperaMin: 11 });
  });

  it('NTF4 — si el encolado falla el error sube, para que el barrido devuelva la espera y reintente', async () => {
    const { caso, encolar } = armar();
    encolar.fallar = true;

    await expect(caso.alEsperarCliente(evento())).rejects.toThrow('outbox caído');
  });
});
