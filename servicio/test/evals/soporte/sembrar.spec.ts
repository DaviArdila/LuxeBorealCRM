import { MAX_CARACTERES_TEXTOS_EN_PROMPT, MAX_CASOS_INDICE } from '../../../src/modulos/asistente/dominio/indice.js';
import { casosDeRelleno } from './sembrar.js';

describe('test/evals — casosDeRelleno', () => {
  it('CAS8 — Los casos de relleno de un índice grande no caben en el prompt: el modelo tiene que consultarlos', () => {
    const relleno = casosDeRelleno(MAX_CASOS_INDICE);
    const caracteres = relleno.reduce((total, caso) => total + caso.texto.length, 0);

    expect(relleno).toHaveLength(MAX_CASOS_INDICE);
    // Con un caso menos (el que se consulta ocupa uno de los cupos del índice) siguen sin caber.
    expect(caracteres - (relleno[0]?.texto.length ?? 0)).toBeGreaterThan(MAX_CARACTERES_TEXTOS_EN_PROMPT);
  });

  it('cada caso de relleno tiene un título distinto y ordenado', () => {
    const titulos = casosDeRelleno(3).map((caso) => caso.titulo);

    expect(titulos).toEqual(['Relleno 001', 'Relleno 002', 'Relleno 003']);
  });
});
