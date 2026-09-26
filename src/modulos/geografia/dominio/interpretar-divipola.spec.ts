import { describe, expect, it } from 'vitest';
import { FuenteDivipolaInvalida } from './geografia.js';
import { interpretarDivipola } from './interpretar-divipola.js';

function filaFuente(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    cod_dpto: '05',
    dpto: 'ANTIOQUIA',
    cod_mpio: '05001',
    nom_mpio: 'MEDELLÍN',
    tipo_municipio: 'Municipio',
    ...overrides,
  };
}

describe('interpretarDivipola (dominio, T4)', () => {
  it('rellena con ceros a la izquierda los códigos de departamento y municipio', () => {
    const catalogo = interpretarDivipola(
      JSON.stringify([filaFuente({ cod_dpto: '5', cod_mpio: '5001', nom_mpio: 'Restrepo' })]),
    );

    expect(catalogo.departamentos).toEqual([{ id: '05', nombre: 'ANTIOQUIA' }]);
    expect(catalogo.ciudades).toEqual([{ id: '05001', departamentoId: '05', nombre: 'Restrepo' }]);
  });

  it('valida que el código de municipio empiece con el código de su departamento', () => {
    const texto = JSON.stringify([filaFuente({ cod_dpto: '05', cod_mpio: '08001' })]);

    expect(() => interpretarDivipola(texto)).toThrow(FuenteDivipolaInvalida);
  });

  it('rechaza un código de departamento con longitud distinta a 2 tras el relleno', () => {
    const texto = JSON.stringify([filaFuente({ cod_dpto: '123' })]);

    expect(() => interpretarDivipola(texto)).toThrow(FuenteDivipolaInvalida);
  });

  it('rechaza un código de municipio con longitud distinta a 5 tras el relleno', () => {
    const texto = JSON.stringify([filaFuente({ cod_mpio: '123456' })]);

    expect(() => interpretarDivipola(texto)).toThrow(FuenteDivipolaInvalida);
  });

  it('acepta el mismo código de departamento repetido con el mismo nombre', () => {
    const texto = JSON.stringify([
      filaFuente({ cod_mpio: '05001', nom_mpio: 'MEDELLÍN' }),
      filaFuente({ cod_mpio: '05002', nom_mpio: 'ABEJORRAL' }),
    ]);

    const catalogo = interpretarDivipola(texto);

    expect(catalogo.departamentos).toEqual([{ id: '05', nombre: 'ANTIOQUIA' }]);
    expect(catalogo.ciudades).toHaveLength(2);
  });

  it('rechaza un código de departamento repetido con nombre distinto', () => {
    const texto = JSON.stringify([
      filaFuente({ dpto: 'ANTIOQUIA' }),
      filaFuente({ cod_mpio: '05002', nom_mpio: 'ABEJORRAL', dpto: 'OTRO NOMBRE' }),
    ]);

    expect(() => interpretarDivipola(texto)).toThrow(FuenteDivipolaInvalida);
  });

  it('rechaza un código de municipio repetido con datos distintos', () => {
    const texto = JSON.stringify([
      filaFuente({ nom_mpio: 'MEDELLÍN' }),
      filaFuente({ nom_mpio: 'OTRO NOMBRE' }),
    ]);

    expect(() => interpretarDivipola(texto)).toThrow(FuenteDivipolaInvalida);
  });

  it('conserva el nombre tal como viene en la fuente, incluidas comas y comillas', () => {
    const texto = JSON.stringify([
      filaFuente({
        cod_dpto: '11',
        dpto: 'BOGOTÁ, D.C.',
        cod_mpio: '11001',
        nom_mpio: 'BOGOTÁ, D.C.',
      }),
    ]);

    const catalogo = interpretarDivipola(texto);

    expect(catalogo.departamentos[0]?.nombre).toBe('BOGOTÁ, D.C.');
    expect(catalogo.ciudades[0]?.nombre).toBe('BOGOTÁ, D.C.');
  });

  it('lanza FuenteDivipolaInvalida cuando falta un campo requerido', () => {
    const fila = filaFuente();
    delete fila.cod_dpto;
    const texto = JSON.stringify([fila]);

    expect(() => interpretarDivipola(texto)).toThrow(FuenteDivipolaInvalida);
  });

  it('lanza FuenteDivipolaInvalida cuando el texto no es JSON válido', () => {
    expect(() => interpretarDivipola('{esto no es json')).toThrow(FuenteDivipolaInvalida);
  });

  it('lanza FuenteDivipolaInvalida cuando el JSON no es un arreglo', () => {
    expect(() => interpretarDivipola(JSON.stringify({ no: 'es un arreglo' }))).toThrow(
      FuenteDivipolaInvalida,
    );
  });

  it('nombra la fila en el error cuando la segunda fila es la que falla', () => {
    const texto = JSON.stringify([filaFuente(), filaFuente({ cod_dpto: '999' })]);

    try {
      interpretarDivipola(texto);
      throw new Error('se esperaba que interpretarDivipola lanzara');
    } catch (error) {
      expect(error).toBeInstanceOf(FuenteDivipolaInvalida);
      expect((error as FuenteDivipolaInvalida).fila).toBe(2);
    }
  });
});
