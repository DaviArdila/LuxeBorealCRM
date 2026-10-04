import type { CotizarEnvio, ResultadoCotizacion } from '../../../catalogo/index.js';
import { crearCotizarEnvio } from './cotizar-envio.js';

// AGT8 (cotizar_envio): rango, días, contra entrega y política literal; sin cobertura deja el efecto.

const CONTEXTO = { sesion: { conversacionId: 'c', version: 0 }, contactoId: 'k', efectosPrevios: [] };

function cotizador(resultado: ResultadoCotizacion) {
  const llamadas: unknown[][] = [];
  const caso = {
    ejecutar: (...args: unknown[]) => {
      llamadas.push(args);
      return Promise.resolve(resultado);
    },
  } as unknown as CotizarEnvio;
  return { caso, llamadas };
}

describe('modulos/agente/aplicacion/herramientas — cotizar_envio', () => {
  it('con cobertura devuelve rango, días y contra entrega con la política literal', async () => {
    const { caso, llamadas } = cotizador({
      cobertura: true,
      rangoTexto: 'entre $12.000 y $18.000',
      diasTexto: '2 a 4 días hábiles',
      contraentregaDisponible: true,
      politicaContraentregaTexto: 'El recargo se suma al total.',
    });

    const resultado = await crearCotizarEnvio(caso).ejecutar(
      { id_producto: 'SKU-1', departamento: 'Antioquia', ciudad: 'Medellín' },
      CONTEXTO,
    );

    expect(resultado.paraElModelo).toEqual({
      cobertura: true,
      rango_texto: 'entre $12.000 y $18.000',
      dias_texto: '2 a 4 días hábiles',
      contraentrega_disponible: true,
      politica_contraentrega_texto: 'El recargo se suma al total.',
    });
    expect(resultado.efectos).toEqual([]);
    expect(llamadas).toEqual([['SKU-1', { departamento: 'Antioquia', ciudad: 'Medellín' }]]);
  });

  it('sin contra entrega no incluye texto de política', async () => {
    const { caso } = cotizador({
      cobertura: true,
      rangoTexto: 'entre $12.000 y $18.000',
      diasTexto: '2 a 4 días hábiles',
      contraentregaDisponible: false,
    });

    const resultado = await crearCotizarEnvio(caso).ejecutar({ id_producto: 'SKU-1', departamento: 'Chocó' }, CONTEXTO);

    expect(Object.keys(resultado.paraElModelo as object)).not.toContain('politica_contraentrega_texto');
    expect(resultado.paraElModelo).toMatchObject({ contraentrega_disponible: false });
  });

  it('AGT8 — cotizar_envio sin cobertura deja el efecto sin-cobertura', async () => {
    const { caso } = cotizador({ cobertura: false, mensaje: 'Por ahora no llegamos allí.' });

    const resultado = await crearCotizarEnvio(caso).ejecutar(
      { id_producto: 'SKU-1', departamento: 'Vaupés', ciudad: null },
      CONTEXTO,
    );

    expect(resultado.paraElModelo).toEqual({ cobertura: false, mensaje_sin_cobertura: 'Por ahora no llegamos allí.' });
    expect(resultado.efectos).toEqual([{ tipo: 'sin-cobertura', mensaje: 'Por ahora no llegamos allí.' }]);
  });

  it('su definición exige id_producto y departamento; la ciudad es opcional', () => {
    const { definicion } = crearCotizarEnvio({} as CotizarEnvio);

    expect(definicion.nombre).toBe('cotizar_envio');
    expect(definicion.esquema.safeParse({ id_producto: 'x', departamento: 'y' }).success).toBe(true);
    expect(definicion.esquema.safeParse({ id_producto: 'x', departamento: 'y', ciudad: 'z' }).success).toBe(true);
    expect(definicion.esquema.safeParse({ id_producto: 'x' }).success).toBe(false);
  });
});
