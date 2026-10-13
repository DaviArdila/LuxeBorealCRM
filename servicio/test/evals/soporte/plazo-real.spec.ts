import { MARGEN_CASO_REAL_MS, PLAZO_TURNO_REAL_S, plazoCasoRealMs } from './plazo-real.js';

// El modo real corre un `it` por caso; su plazo sale del plazo del turno, no de un `testTimeout` fijo que la corrida
// completa no alcanza (rediseño de las evals reales, T1).

describe('test/evals — plazoCasoRealMs', () => {
  it('EVL3 — El plazo de un caso real cubre cada repetición y cada turno con el doble del plazo del turno', () => {
    // El doble: el bucle del turno y el único reintento de la guarda de dinero pueden agotar cada uno su plazo.
    expect(plazoCasoRealMs({ repeticiones: 3, turnos: 1 })).toBe(3 * 1 * 2 * PLAZO_TURNO_REAL_S * 1000 + MARGEN_CASO_REAL_MS);
  });

  it('crece con los turnos del caso', () => {
    expect(plazoCasoRealMs({ repeticiones: 3, turnos: 3 })).toBeGreaterThan(plazoCasoRealMs({ repeticiones: 3, turnos: 1 }));
  });

  it('el plazo del turno real es el que la corrida da al lock del turno (60 s)', () => {
    expect(PLAZO_TURNO_REAL_S).toBe(60);
  });
});
