import { describe, expect, it } from 'vitest';
import { NOMBRE_PLANTILLA, nombreBaseDeWorker, urlConBase } from './bases-de-prueba.js';

/**
 * Unitario de T1 (`design.md` D6, D7; matriz de amenazas de `tasks.md`): las dos funciones puras
 * que arman el nombre y la URL de la base de datos del worker, sin tocar ningún Postgres real.
 * `nombreBaseDeWorker` es la única barrera antes de ejecutar cualquier SQL con el nombre de base
 * como identificador — MUST lanzar ante cualquier `poolId` que no sea `^\d+$`.
 */
describe('bases-de-prueba (T1, unitario)', () => {
  describe('nombreBaseDeWorker', () => {
    it('devuelve test_<poolId>_<pid> para un identificador válido', () => {
      expect(nombreBaseDeWorker('3_12345')).toBe('test_3_12345');
    });

    it('rechaza un identificador con SQL inyectado (matriz de amenazas)', () => {
      expect(() => nombreBaseDeWorker('1_1; DROP DATABASE x')).toThrow();
    });

    it('rechaza un identificador vacío (matriz de amenazas)', () => {
      expect(() => nombreBaseDeWorker('')).toThrow();
    });

    it('rechaza un poolId sin pid — Vitest no garantiza que VITEST_POOL_ID sea único entre procesos concurrentes', () => {
      expect(() => nombreBaseDeWorker('3')).toThrow();
    });
  });

  describe('urlConBase', () => {
    it('cambia solo la ruta de la URL de administración', () => {
      const urlAdmin = 'postgresql://usuario:clave@localhost:5435/test';

      const resultado = urlConBase(urlAdmin, 'test_7');

      expect(resultado).toBe('postgresql://usuario:clave@localhost:5435/test_7');
    });

    it('conserva usuario, clave, host, puerto y query string de la URL de administración', () => {
      const urlAdmin = 'postgresql://usuario:clave@localhost:5435/test?sslmode=disable';

      const resultado = urlConBase(urlAdmin, NOMBRE_PLANTILLA);

      expect(resultado).toBe(
        `postgresql://usuario:clave@localhost:5435/${NOMBRE_PLANTILLA}?sslmode=disable`,
      );
    });
  });

  it('NOMBRE_PLANTILLA es "plantilla_luxe"', () => {
    expect(NOMBRE_PLANTILLA).toBe('plantilla_luxe');
  });
});
