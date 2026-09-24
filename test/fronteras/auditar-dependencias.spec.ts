import path from 'node:path';
import {
  auditarDependencias,
  evaluarHallazgos,
  parsearHallazgosNpmAudit,
  type ExcepcionAuditoria,
  type HallazgoAuditoria,
} from '../../scripts/auditar-dependencias.js';

/**
 * `scripts/auditar-dependencias.ts` (CI4, D14). La función pura `evaluarHallazgos` recibe una
 * fecha inyectada — nunca `Date.now()`/`new Date()` disperso en la lógica de decisión — para que
 * el escenario de "excepción vencida" sea determinista.
 */
const raizDelProyecto = path.join(import.meta.dirname, '..', '..');
const HOY = new Date('2026-09-24T00:00:00Z');

const excepcionVigente: ExcepcionAuditoria = {
  id: 'GHSA-ejemplo',
  paquete: 'paquete-vulnerable',
  motivo: 'falso positivo confirmado, no aplica a este proyecto',
  fecha: '2026-09-01',
  revisar_antes_de: '2026-12-31',
};

describe('scripts/auditar-dependencias — evaluarHallazgos', () => {
  it('CI4 — Vulnerabilidad sobre el umbral bloquea el build, nombrando paquete y severidad', () => {
    const hallazgos: HallazgoAuditoria[] = [{ paquete: 'paquete-vulnerable', severidad: 'high' }];

    const resultado = evaluarHallazgos(hallazgos, [], 'high', HOY);

    expect(resultado.limpio).toBe(false);
    expect(resultado.mensaje).toContain('paquete-vulnerable');
    expect(resultado.mensaje).toContain('high');
  });

  it('CI4 — Vulnerabilidad bajo el umbral no bloquea el build', () => {
    const hallazgos: HallazgoAuditoria[] = [{ paquete: 'paquete-menor', severidad: 'moderate' }];

    const resultado = evaluarHallazgos(hallazgos, [], 'high', HOY);

    expect(resultado.limpio).toBe(true);
  });

  it('una vulnerabilidad sobre el umbral con excepción vigente no bloquea el build', () => {
    const hallazgos: HallazgoAuditoria[] = [{ paquete: 'paquete-vulnerable', severidad: 'high' }];

    const resultado = evaluarHallazgos(hallazgos, [excepcionVigente], 'high', HOY);

    expect(resultado.limpio).toBe(true);
  });

  it('una excepción vencida (revisar_antes_de en el pasado) falla nombrándola', () => {
    const excepcionVencida: ExcepcionAuditoria = {
      ...excepcionVigente,
      id: 'GHSA-vencida',
      revisar_antes_de: '2026-01-01',
    };
    const hallazgos: HallazgoAuditoria[] = [{ paquete: 'paquete-vulnerable', severidad: 'high' }];

    const resultado = evaluarHallazgos(hallazgos, [excepcionVencida], 'high', HOY);

    expect(resultado.limpio).toBe(false);
    expect(resultado.mensaje).toContain('GHSA-vencida');
    expect(resultado.mensaje.toLowerCase()).toContain('vencida');
  });
});

describe('scripts/auditar-dependencias — parsearHallazgosNpmAudit', () => {
  it('extrae paquete y severidad de la forma real de npm audit --json', () => {
    const json = {
      vulnerabilities: {
        lodash: { severity: 'high', range: '<=4.17.23' },
        'algo-info': { severity: 'info' },
      },
    };

    const hallazgos = parsearHallazgosNpmAudit(json);

    expect(hallazgos).toEqual(
      expect.arrayContaining([
        { paquete: 'lodash', severidad: 'high' },
        { paquete: 'algo-info', severidad: 'info' },
      ]),
    );
  });

  it('devuelve un array vacío si no hay campo vulnerabilities', () => {
    expect(parsearHallazgosNpmAudit({})).toEqual([]);
    expect(parsearHallazgosNpmAudit(null)).toEqual([]);
  });
});

describe('scripts/auditar-dependencias — auditarDependencias (integración real)', () => {
  it(
    'corre npm audit --json real contra este repositorio y respeta auditoria-excepciones.json',
    async () => {
      const resultado = await auditarDependencias(raizDelProyecto, { fechaActual: HOY });

      // Hoy (2026-09-24) los cinco hallazgos reales conocidos (deepmerge-ts, lodash, mysql2,
      // @prisma/config, prisma) están cubiertos por auditoria-excepciones.json con
      // revisar_antes_de 2026-12-24: el paso MUST quedar en verde con la fecha de este test.
      expect(resultado.limpio).toBe(true);
    },
    30_000,
  );
});
