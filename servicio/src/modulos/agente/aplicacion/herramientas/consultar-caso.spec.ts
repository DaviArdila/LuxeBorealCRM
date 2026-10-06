import type { ConsultaCasos, ResultadoCaso } from '../../../asistente/index.js';
import { crearConsultarCaso } from './consultar-caso.js';

const CONTEXTO = { sesion: { conversacionId: 'c', version: 0 }, contactoId: 'k', efectosPrevios: [] };

function casos(resultado: ResultadoCaso) {
  const consultados: string[] = [];
  const consulta = {
    consultar: (titulo: string) => {
      consultados.push(titulo);
      return Promise.resolve(resultado);
    },
  } as unknown as ConsultaCasos;
  return { consulta, consultados };
}

describe('modulos/agente/aplicacion/herramientas — consultar_caso', () => {
  it('CAS8 — consultar_caso devuelve el texto y el modo del caso, sin tocar una palabra', async () => {
    const texto = 'Aceptamos devoluciones dentro de 5 días, según   el estado.';
    const { consulta, consultados } = casos({ encontrado: true, titulo: 'Devoluciones', modo: 'literal', texto });

    const resultado = await crearConsultarCaso(consulta).ejecutar({ titulo: 'devoluciones' }, CONTEXTO);

    expect(consultados).toEqual(['devoluciones']);
    expect(resultado.paraElModelo).toEqual({ encontrado: true, titulo: 'Devoluciones', modo: 'literal', texto });
    expect(resultado.efectos).toEqual([]);
  });

  it('CAS8 — Un caso en modo guía llega con su modo para que el modelo lo use como base', async () => {
    const { consulta } = casos({ encontrado: true, titulo: 'Cuidado de joyas', modo: 'guia', texto: 'Evita el agua y los perfumes.' });

    const resultado = await crearConsultarCaso(consulta).ejecutar({ titulo: 'Cuidado de joyas' }, CONTEXTO);

    expect(resultado.paraElModelo).toMatchObject({ modo: 'guia' });
  });

  it('CAS8 — Un caso inexistente devuelve los títulos disponibles y nada más', async () => {
    const { consulta } = casos({ encontrado: false, titulosDisponibles: ['Contra entrega', 'Devoluciones'] });

    const resultado = await crearConsultarCaso(consulta).ejecutar({ titulo: 'Garantía' }, CONTEXTO);

    expect(resultado.paraElModelo).toEqual({ encontrado: false, titulos_disponibles: ['Contra entrega', 'Devoluciones'] });
  });

  it('su definición exige un título', () => {
    const { definicion } = crearConsultarCaso({} as ConsultaCasos);

    expect(definicion.nombre).toBe('consultar_caso');
    expect(definicion.esquema.safeParse({ titulo: 'Garantía' }).success).toBe(true);
    expect(definicion.esquema.safeParse({}).success).toBe(false);
  });
});
