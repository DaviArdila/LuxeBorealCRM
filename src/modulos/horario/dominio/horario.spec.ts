import { decidirDentroDeHorario, dentroDeRango, momentoLocal } from './horario.js';

// HOR1-HOR6 — títulos tomados literalmente de
// `openspec/changes/fase-02-catalogo/specs/horario/spec.md`. HOR7 (Clock inyectado) es de T9
// (aplicación), no de este dominio puro.

describe('modulos/horario/dominio', () => {
  it('convierte una fecha UTC al día, minutos y fecha ISO de Bogotá (America/Bogota, UTC-5)', () => {
    // 2026-09-16T15:30:00Z → miércoles 10:30 en Bogotá.
    expect(momentoLocal(new Date('2026-09-16T15:30:00Z'))).toEqual({
      dia: 'mie',
      minutos: 10 * 60 + 30,
      fechaIso: '2026-09-16',
    });
  });

  it('HOR1 — Una excepción (festivo) cierra el día aunque el patrón diga abierto', () => {
    const momento = momentoLocal(new Date('2026-09-16T15:30:00Z')); // mié 10:30 Bogotá
    const patronAbierto = { mie: '08:00-18:00' };

    const resultado = decidirDentroDeHorario(momento, true, patronAbierto);

    expect(resultado.dentro).toBe(false);
  });

  it('HOR2 — Sin parámetro horario_atencion configurado se asume dentro de horario', () => {
    const momento = momentoLocal(new Date('2026-09-16T15:30:00Z'));

    const resultado = decidirDentroDeHorario(momento, false, null);

    expect(resultado.dentro).toBe(true);
  });

  it('HOR3 — Un valor de horario_atencion que no es JSON válido asume dentro de horario y solo advierte', () => {
    const momento = momentoLocal(new Date('2026-09-16T15:30:00Z'));

    for (const valorCrudo of ['no soy un objeto', ['lun-vie', '08:00-18:00'], 42]) {
      const resultado = decidirDentroDeHorario(momento, false, valorCrudo);
      expect(resultado.dentro).toBe(true);
      expect(resultado.advertencia).toBeTruthy();
    }
  });

  it('HOR4 — Un día no mencionado en el patrón semanal se asume dentro de horario', () => {
    const domingo = { dia: 'dom', minutos: 10 * 60, fechaIso: '2026-09-20' };
    const patron = { 'lun-vie': '08:00-18:00', sab: '09:00-13:00' };

    const resultado = decidirDentroDeHorario(domingo, false, patron);

    expect(resultado.dentro).toBe(true);
  });

  it('HOR5 — Un día con valor null en el patrón semanal se asume fuera de horario', () => {
    const domingo = { dia: 'dom', minutos: 10 * 60, fechaIso: '2026-09-20' };
    const patron = { dom: null };

    const resultado = decidirDentroDeHorario(domingo, false, patron);

    expect(resultado.dentro).toBe(false);
  });

  it('HOR6 — Un rango que cruza medianoche incluye las horas antes y después de medianoche, y excluye las de en medio', () => {
    expect(dentroDeRango('20:00-02:00', 23 * 60)).toBe(true);
    expect(dentroDeRango('20:00-02:00', 1 * 60)).toBe(true);
    expect(dentroDeRango('20:00-02:00', 12 * 60)).toBe(false);
  });
});
