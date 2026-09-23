import {
  formatearCop,
  formatearDias,
  formatearRangoCop,
  formatearRecargoContraentrega,
} from './dinero.js';

// CMP1 — Formato de dinero en pesos colombianos. Nombres de escenario tomados literalmente de
// `openspec/changes/fase-00a-esqueleto/specs/compartido/spec.md`.

describe('compartido/dinero', () => {
  it('CMP1 — Formatear un valor entero de COP produce texto con símbolo y separador de miles', () => {
    expect(formatearCop(389000)).toBe('$389.000');
  });

  it('CMP1 — Formatear un rango de COP une ambos extremos formateados', () => {
    expect(formatearRangoCop(15000, 25000)).toBe(
      `entre ${formatearCop(15000)} y ${formatearCop(25000)}`,
    );
  });

  it('CMP1 — Formatear un recargo contraentrega incluye el porcentaje y su explicación', () => {
    const resultado = formatearRecargoContraentrega(3);

    expect(resultado).toContain('3%');
    expect(resultado).toContain('contra entrega');
  });

  it('CMP1 — Formatear días de entrega con el mismo mínimo y máximo produce un solo valor', () => {
    expect(formatearDias(1, 1)).toBe('1 día');
  });

  it('CMP1 — Formatear días de entrega con mínimo y máximo distintos produce un rango', () => {
    expect(formatearDias(1, 2)).toBe('entre 1 y 2 días');
  });
});
