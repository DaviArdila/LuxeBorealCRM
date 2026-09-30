import { describe, expect, it } from 'vitest';
import { RepositorioLeadEnMemoria } from '../../../../test/fakes/repositorio-lead-en-memoria.js';
import { ClockFalso } from '../../../../test/fakes/clock-falso.js';
import type { EncolarAviso, EntradaAviso } from '../../notificaciones/index.js';
import { AvisarLead } from './avisar-lead.js';

// Escenarios NTF1 (datos personales) y NTF2 (ventana) de
// `openspec/changes/fase-08-leads-handoff/specs/notificaciones/spec.md`.

class EncolarAvisoFalso {
  readonly avisos: EntradaAviso[] = [];
  fallar = false;
  ejecutar(entrada: EntradaAviso): Promise<void> {
    if (this.fallar) return Promise.reject(new Error('outbox caído'));
    this.avisos.push(entrada);
    return Promise.resolve();
  }
}

const AHORA = new Date('2026-09-30T15:00:00.000Z');
const config = { LEADS_VENTANA_NOTIFICACION_H: 24 } as never;

function armar() {
  const repositorio = new RepositorioLeadEnMemoria();
  const encolar = new EncolarAvisoFalso();
  const clock = new ClockFalso(AHORA);
  const caso = new AvisarLead(repositorio, encolar as unknown as EncolarAviso, clock, config);
  const crear = (conversacionId: string, sobrescribir: Partial<Parameters<typeof repositorio.crear>[0]> = {}) =>
    repositorio.crear({
      contactoId: 'contacto-1',
      conversacionId,
      productoId: null,
      temperatura: 'caliente',
      senales: ['pide_pagar'],
      resumen: 'Quiere pagar la manilla.',
      derivado: true,
      ...sobrescribir,
    });
  return { repositorio, encolar, clock, caso, crear };
}

describe('AvisarLead (NTF1, NTF2)', () => {
  it('NTF1 — encola el aviso con el resumen del lead y marca notificado_en', async () => {
    const { caso, encolar, crear, repositorio } = armar();
    const lead = await crear('conv-1');

    await expect(caso.ejecutar('conv-1')).resolves.toBe('avisado');

    expect(encolar.avisos).toHaveLength(1);
    expect(encolar.avisos[0]?.aviso).toEqual({
      tipo: 'lead',
      temperatura: 'caliente',
      senales: ['pide_pagar'],
      resumen: 'Quiere pagar la manilla.',
      capturadoFueraHorario: false,
    });
    expect(encolar.avisos[0]?.claveIdempotencia).toContain(lead.id);
    expect(repositorio.leads[0]?.notificadoEn).toEqual(AHORA);
  });

  it('NTF1 — el aviso no lleva nada del contacto: solo temperatura, señales y resumen', async () => {
    const { caso, encolar, crear } = armar();
    await crear('conv-1');

    await caso.ejecutar('conv-1');

    expect(JSON.stringify(encolar.avisos)).not.toMatch(/contacto-1|telefono|direccion/i);
  });

  it('NTF2 — Ventana de 24 horas por contacto: no avisa otra vez a un contacto avisado hace 3 horas', async () => {
    const { caso, encolar, crear, clock } = armar();
    await crear('conv-1');
    await caso.ejecutar('conv-1');
    await crear('conv-2');
    clock.avanzar(3 * 3_600_000);

    const resultado = await caso.ejecutar('conv-2');

    expect(resultado).toBe('omitido');
    expect(encolar.avisos).toHaveLength(1);
  });

  it('NTF2 — Pasada la ventana se vuelve a avisar', async () => {
    const { caso, encolar, crear, clock } = armar();
    await crear('conv-1');
    await caso.ejecutar('conv-1');
    await crear('conv-2');

    clock.avanzar(25 * 3_600_000);

    await expect(caso.ejecutar('conv-2')).resolves.toBe('avisado');
    expect(encolar.avisos).toHaveLength(2);
  });

  it('NTF2 — Dos derivaciones simultáneas avisan una sola vez', async () => {
    const { caso, encolar, crear } = armar();
    await crear('conv-1');
    await crear('conv-2');

    await Promise.all([caso.ejecutar('conv-1'), caso.ejecutar('conv-2')]);

    expect(encolar.avisos).toHaveLength(1);
  });

  it('un lead que no está derivado no se avisa', async () => {
    const { caso, encolar, crear } = armar();
    await crear('conv-1', { derivado: false });

    await expect(caso.ejecutar('conv-1')).resolves.toBe('omitido');
    expect(encolar.avisos).toEqual([]);
  });

  it('sin lead abierto no hay nada que avisar', async () => {
    await expect(armar().caso.ejecutar('conv-x')).resolves.toBe('omitido');
  });

  it('NTF4 — si el encolado falla se deshace la marca y el error sube', async () => {
    const { caso, encolar, crear, repositorio } = armar();
    await crear('conv-1');
    encolar.fallar = true;

    await expect(caso.ejecutar('conv-1')).rejects.toThrow('outbox caído');

    expect(repositorio.leads[0]?.notificadoEn).toBeNull();
  });

  it('un lead capturado fuera de horario lo dice en el aviso', async () => {
    const { caso, encolar, crear, repositorio } = armar();
    const lead = await crear('conv-1');
    await repositorio.actualizar(lead.id, { capturadoFueraHorario: true });

    await caso.ejecutar('conv-1');

    expect(encolar.avisos[0]?.aviso.capturadoFueraHorario).toBe(true);
  });
});
