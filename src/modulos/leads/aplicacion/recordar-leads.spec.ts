import { describe, expect, it } from 'vitest';
import { ClockFalso } from '../../../../test/fakes/clock-falso.js';
import { RepositorioLeadEnMemoria } from '../../../../test/fakes/repositorio-lead-en-memoria.js';
import type { EncolarAviso, EntradaAviso } from '../../notificaciones/index.js';
import { RecordarLeads } from './recordar-leads.js';

// Escenarios LDS5 de `openspec/changes/archive/2026-09-30-fase-08-leads-handoff/specs/leads/spec.md`.

class EncolarAvisoFalso {
  readonly avisos: EntradaAviso[] = [];
  fallarEn: string | null = null;
  ejecutar(entrada: EntradaAviso): Promise<void> {
    if (this.fallarEn !== null && entrada.grupo === this.fallarEn) return Promise.reject(new Error('outbox caído'));
    this.avisos.push(entrada);
    return Promise.resolve();
  }
}

const AHORA = new Date('2026-09-30T15:00:00.000Z');
const config = { LEADS_RECORDATORIO_MIN: 30 } as never;
const MIN = 60_000;

function armar() {
  const repositorio = new RepositorioLeadEnMemoria();
  const encolar = new EncolarAvisoFalso();
  const clock = new ClockFalso(AHORA);
  const caso = new RecordarLeads(repositorio, encolar as unknown as EncolarAviso, clock, config);
  /** Un lead derivado y avisado hace `minutos`. */
  const derivadoHace = async (minutos: number, conversacionId = 'conv-1') => {
    const lead = await repositorio.crear({
      contactoId: `c-${conversacionId}`,
      conversacionId,
      productoId: null,
      temperatura: 'caliente',
      senales: ['pide_pagar'],
      resumen: 'Quiere pagar.',
      derivado: true,
    });
    await repositorio.marcarNotificado(lead, new Date(AHORA.getTime() - minutos * MIN), new Date(0));
    return lead;
  };
  return { repositorio, encolar, clock, caso, derivadoHace };
}

describe('RecordarLeads (LDS5, D10)', () => {
  it('LDS5 — Recordatorio a un lead sin atender: se encola y recordatorio_en queda marcado', async () => {
    const { caso, encolar, repositorio, derivadoHace } = armar();
    const lead = await derivadoHace(45);

    await expect(caso.ejecutar()).resolves.toBe(1);

    expect(encolar.avisos).toHaveLength(1);
    expect(encolar.avisos[0]).toMatchObject({ claveIdempotencia: `recordatorio:${lead.id}` });
    expect(encolar.avisos[0]?.aviso).toMatchObject({ tipo: 'recordatorio', temperatura: 'caliente' });
    expect(repositorio.leads[0]?.recordatorioEn).toEqual(AHORA);
  });

  it('un lead con menos de LEADS_RECORDATORIO_MIN minutos todavía no se recuerda', async () => {
    const { caso, encolar, derivadoHace } = armar();
    await derivadoHace(10);

    await expect(caso.ejecutar()).resolves.toBe(0);
    expect(encolar.avisos).toEqual([]);
  });

  it('LDS5 — Un lead ya atendido no se recuerda', async () => {
    const { caso, encolar, repositorio, derivadoHace } = armar();
    const lead = await derivadoHace(45);
    repositorio.leads[0] = { ...lead, ...repositorio.leads[0], estado: 'en_atencion' };

    await expect(caso.ejecutar()).resolves.toBe(0);
    expect(encolar.avisos).toEqual([]);
  });

  it('LDS5 — El recordatorio no se repite', async () => {
    const { caso, encolar, derivadoHace } = armar();
    await derivadoHace(45);

    await caso.ejecutar();
    await expect(caso.ejecutar()).resolves.toBe(0);

    expect(encolar.avisos).toHaveLength(1);
  });

  it('un lead que nunca se avisó no se recuerda (no hay aviso que recordar)', async () => {
    const { caso, encolar, repositorio } = armar();
    await repositorio.crear({
      contactoId: 'c-1',
      conversacionId: 'conv-1',
      productoId: null,
      temperatura: 'caliente',
      senales: ['pide_pagar'],
      resumen: 'x',
      derivado: true,
    });

    await expect(caso.ejecutar()).resolves.toBe(0);
    expect(encolar.avisos).toEqual([]);
  });

  it('si el encolado de uno falla se deshace su marca y los demás siguen', async () => {
    const { caso, encolar, repositorio, derivadoHace } = armar();
    const fallido = await derivadoHace(45, 'conv-1');
    await derivadoHace(45, 'conv-2');
    encolar.fallarEn = `lead:${fallido.id}`;

    await expect(caso.ejecutar()).resolves.toBe(1);

    expect(repositorio.leads.find((lead) => lead.id === fallido.id)?.recordatorioEn).toBeNull();
    expect(encolar.avisos).toHaveLength(1);
  });
});
