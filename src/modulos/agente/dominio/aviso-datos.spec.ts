import type { PasoRespuesta } from '../../conversaciones/index.js';
import { anteponerAviso } from './aviso-datos.js';

const paso = (id: string, texto: string): PasoRespuesta => ({ paso: id, tipo: 'texto', texto });

describe('anteponerAviso', () => {
  it('antepone el aviso con un salto de párrafo al primer paso de texto', () => {
    const resultado = anteponerAviso([paso('a', 'uno'), paso('b', 'dos')], 'Aviso');

    expect(resultado).toEqual([paso('a', 'Aviso\n\nuno'), paso('b', 'dos')]);
  });

  it('no crea pasos: sin pasos devuelve una lista vacía', () => {
    expect(anteponerAviso([], 'Aviso')).toEqual([]);
  });

  it('un aviso vacío no modifica la respuesta', () => {
    const pasos = [paso('a', 'uno')];

    expect(anteponerAviso(pasos, '  ')).toBe(pasos);
  });
});
