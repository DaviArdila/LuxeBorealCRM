import type { CotizarEnvio, ResultadoCotizacion } from '../../../catalogo/index.js';
import { crearCotizarEnvio } from './cotizar-envio.js';

// AGT8 (cotizar_envio): solo datos (rango, días, contra entrega); sin cobertura deja el efecto, sin ningún texto.

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
  it('AGT8 — con cobertura devuelve rango, días y contra entrega, sin ningún texto de política', async () => {
    const { caso, llamadas } = cotizador({
      cobertura: true,
      rangoTexto: 'entre $12.000 y $18.000',
      diasTexto: '2 a 4 días hábiles',
      contraentregaDisponible: true,
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
    });
    expect(Object.keys(resultado.paraElModelo as object)).not.toContain('politica_contraentrega_texto');
    expect(resultado.efectos).toEqual([]);
    expect(llamadas).toEqual([['SKU-1', { departamento: 'Antioquia', ciudad: 'Medellín' }]]);
  });

  it('AGT8 — cotizar_envio con contra entrega no adjunta la política', async () => {
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

  it('AGT8 — cotizar_envio sin cobertura deja el efecto sin-cobertura y ningún texto', async () => {
    const { caso } = cotizador({ cobertura: false });

    const resultado = await crearCotizarEnvio(caso).ejecutar(
      { id_producto: 'SKU-1', departamento: 'Vaupés', ciudad: null },
      CONTEXTO,
    );

    expect(resultado.paraElModelo).toEqual({ cobertura: false });
    expect(resultado.efectos).toEqual([{ tipo: 'sin-cobertura' }]);
  });

  it('AGT13 — la descripción de la herramienta es neutra: no nombra ningún caso ni ordena consultarlo', () => {
    const { definicion } = crearCotizarEnvio({} as CotizarEnvio);

    expect(definicion.descripcion).not.toMatch(/contra entrega:|consult|caso|pol[ií]tica|literal/i);
  });

  it('su definición exige id_producto y departamento; la ciudad es opcional', () => {
    const { definicion } = crearCotizarEnvio({} as CotizarEnvio);

    expect(definicion.nombre).toBe('cotizar_envio');
    expect(definicion.esquema.safeParse({ id_producto: 'x', departamento: 'y' }).success).toBe(true);
    expect(definicion.esquema.safeParse({ id_producto: 'x', departamento: 'y', ciudad: 'z' }).success).toBe(true);
    expect(definicion.esquema.safeParse({ id_producto: 'x' }).success).toBe(false);
  });
});
