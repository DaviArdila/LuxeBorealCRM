import type { Herramienta } from '../dominio/herramienta.js';
import { RegistroHerramientas } from './registro-herramientas.js';

function herramienta(nombre: string): Herramienta {
  return {
    definicion: {
      nombre,
      descripcion: nombre,
      esquema: { safeParse: () => ({ success: true }) },
      esquemaJson: {},
    },
    ejecutar: () => Promise.resolve({ paraElModelo: {}, efectos: [] }),
  };
}

describe('modulos/agente/aplicacion — RegistroHerramientas (D1)', () => {
  it('busca por nombre y entrega las definiciones en orden de registro', () => {
    const registro = new RegistroHerramientas([herramienta('a'), herramienta('b')]);

    expect(registro.obtener('b')?.definicion.nombre).toBe('b');
    expect(registro.obtener('c')).toBeUndefined();
    expect(registro.definiciones().map((d) => d.nombre)).toEqual(['a', 'b']);
  });

  it('falla al arrancar si dos herramientas tienen el mismo nombre', () => {
    expect(() => new RegistroHerramientas([herramienta('a'), herramienta('a')])).toThrow(/duplicada.*"a"/);
  });

  it('falla al arrancar si el total no es el esperado', () => {
    expect(() => new RegistroHerramientas([herramienta('a')], 7)).toThrow(/exactamente 7/);
    expect(() => new RegistroHerramientas([herramienta('a')], 1)).not.toThrow();
  });
});
