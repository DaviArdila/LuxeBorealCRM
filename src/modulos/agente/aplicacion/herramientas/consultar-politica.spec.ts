import type { ConsultarPolitica, ResultadoPolitica } from '../../../catalogo/index.js';
import { crearConsultarPolitica } from './consultar-politica.js';

const CONTEXTO = { sesion: { conversacionId: 'c', version: 0 }, contactoId: 'k', efectosPrevios: [] };

function politicas(resultado: ResultadoPolitica) {
  return { ejecutar: () => Promise.resolve(resultado) } as unknown as ConsultarPolitica;
}

describe('modulos/agente/aplicacion/herramientas — consultar_politica', () => {
  it('AGT8 — consultar_politica devuelve el texto literal', async () => {
    const texto = 'Aceptamos devoluciones dentro de 5 días, según   el estado.';

    const resultado = await crearConsultarPolitica(politicas({ encontrada: true, texto })).ejecutar(
      { tema: 'devoluciones' },
      CONTEXTO,
    );

    expect(resultado.paraElModelo).toEqual({ encontrada: true, texto });
    expect(resultado.efectos).toEqual([]);
  });

  it('un tema que no existe devuelve los temas disponibles y nada más', async () => {
    const resultado = await crearConsultarPolitica(
      politicas({ encontrada: false, temasDisponibles: ['contra_entrega', 'devoluciones'] }),
    ).ejecutar({ tema: 'garantia' }, CONTEXTO);

    expect(resultado.paraElModelo).toEqual({
      encontrada: false,
      temas_disponibles: ['contra_entrega', 'devoluciones'],
    });
  });

  it('su definición exige un tema', () => {
    const { definicion } = crearConsultarPolitica({} as ConsultarPolitica);

    expect(definicion.nombre).toBe('consultar_politica');
    expect(definicion.esquema.safeParse({ tema: 'devoluciones' }).success).toBe(true);
    expect(definicion.esquema.safeParse({}).success).toBe(false);
  });
});
