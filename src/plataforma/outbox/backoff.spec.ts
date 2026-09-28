import { describe, expect, it } from 'vitest';
import { retrasoSegundos } from './backoff.js';

describe('retrasoSegundos (D12)', () => {
  it('crece exponencialmente desde la base en los primeros intentos', () => {
    expect(retrasoSegundos(1, 15, 300)).toBe(15);
    expect(retrasoSegundos(2, 15, 300)).toBe(30);
    expect(retrasoSegundos(3, 15, 300)).toBe(60);
    expect(retrasoSegundos(4, 15, 300)).toBe(120);
  });

  it('se acota al máximo configurado aunque la potencia lo supere', () => {
    expect(retrasoSegundos(5, 15, 300)).toBe(240);
    expect(retrasoSegundos(6, 15, 300)).toBe(300);
    expect(retrasoSegundos(10, 15, 300)).toBe(300);
  });

  it('respeta una base y un máximo distintos de los valores por defecto', () => {
    expect(retrasoSegundos(1, 1, 10)).toBe(1);
    expect(retrasoSegundos(2, 1, 10)).toBe(2);
    expect(retrasoSegundos(5, 1, 10)).toBe(10);
  });
});
