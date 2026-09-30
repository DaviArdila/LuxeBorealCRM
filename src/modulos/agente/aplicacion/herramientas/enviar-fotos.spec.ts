import { ContadoresSesionEnMemoria } from '../../../../../test/fakes/contadores-sesion-en-memoria.js';
import { ProductoNoDisponible, type ObtenerFotosProducto } from '../../../catalogo/index.js';
import { crearEnviarFotos } from './enviar-fotos.js';

// Escenarios AGT9 de `openspec/changes/fase-07b-agente-llm-herramientas/specs/agente/spec.md`.

const SESION = { conversacionId: 'conv-1', version: 0 };
const CONTEXTO = { sesion: SESION, contactoId: 'k', efectosPrevios: [] };

function fotos(claveCollage: string | null, claves: readonly string[]) {
  const pedidos: number[] = [];
  const caso = {
    ejecutar: (_id: string, maximo: number) => {
      pedidos.push(maximo);
      return Promise.resolve({ claveCollage, clavesFotos: claves.slice(0, maximo) });
    },
  } as unknown as ObtenerFotosProducto;
  return { caso, pedidos };
}

function crear(caso: ObtenerFotosProducto, tope = 4) {
  const contadores = new ContadoresSesionEnMemoria();
  return { herramienta: crearEnviarFotos(caso, contadores, { AGENTE_FOTOS_INDIVIDUALES_MAX: tope }), contadores };
}

describe('modulos/agente/aplicacion/herramientas — enviar_fotos', () => {
  it('AGT9 — El modo collage produce una sola imagen', async () => {
    const { caso } = fotos('catalogo/SKU-1/collage.jpg', ['a', 'b']);
    const { herramienta } = crear(caso);

    const resultado = await herramienta.ejecutar({ id_producto: 'SKU-1', modo: 'collage' }, CONTEXTO);

    expect(resultado.efectos).toEqual([{ tipo: 'enviar-imagen', claveObjeto: 'catalogo/SKU-1/collage.jpg' }]);
    expect(resultado.paraElModelo).toEqual({ enviadas: 1 });
  });

  it('AGT9 — Las fotos individuales respetan el tope de la sesión', async () => {
    const { caso, pedidos } = fotos(null, ['f1', 'f2', 'f3']);
    const { herramienta, contadores } = crear(caso, 4);
    await contadores.sumarFotosIndividuales(SESION, 3);

    const resultado = await herramienta.ejecutar({ id_producto: 'SKU-2', modo: 'individuales' }, CONTEXTO);

    expect(resultado.efectos).toEqual([{ tipo: 'enviar-imagen', claveObjeto: 'f1' }]);
    expect(resultado.paraElModelo).toEqual({ enviadas: 1 });
    expect(pedidos).toEqual([1]);
    expect(await contadores.fotosIndividuales(SESION)).toBe(4);
  });

  it('con el tope ya alcanzado no envía nada y lo dice', async () => {
    const { caso } = fotos(null, ['f1']);
    const { herramienta, contadores } = crear(caso, 2);
    await contadores.sumarFotosIndividuales(SESION, 2);

    const resultado = await herramienta.ejecutar({ id_producto: 'SKU-2', modo: 'individuales' }, CONTEXTO);

    expect(resultado.efectos).toEqual([]);
    expect(resultado.paraElModelo).toMatchObject({ enviadas: 0, error: expect.any(String) as unknown });
  });

  it('las fotos individuales salen en orden y el modelo no ve claves ni URLs', async () => {
    const { caso } = fotos('c', ['portada', 'segunda']);
    const { herramienta } = crear(caso);

    const resultado = await herramienta.ejecutar({ id_producto: 'SKU-1', modo: 'individuales' }, CONTEXTO);

    expect(resultado.efectos).toEqual([
      { tipo: 'enviar-imagen', claveObjeto: 'portada' },
      { tipo: 'enviar-imagen', claveObjeto: 'segunda' },
    ]);
    expect(JSON.stringify(resultado.paraElModelo)).not.toContain('portada');
    expect(resultado.paraElModelo).toEqual({ enviadas: 2 });
  });

  it('AGT9 — Un producto sin fotos no envía nada y lo dice', async () => {
    const { caso } = fotos(null, []);
    const { herramienta } = crear(caso);

    for (const modo of ['collage', 'individuales'] as const) {
      const resultado = await herramienta.ejecutar({ id_producto: 'SKU-3', modo }, CONTEXTO);
      expect(resultado.efectos).toEqual([]);
      expect(resultado.paraElModelo).toMatchObject({ enviadas: 0, error: expect.any(String) as unknown });
    }
  });

  it('un producto inexistente o inactivo no envía nada y lo dice', async () => {
    const caso = { ejecutar: () => Promise.reject(new ProductoNoDisponible()) } as unknown as ObtenerFotosProducto;
    const { herramienta } = crear(caso);

    const resultado = await herramienta.ejecutar({ id_producto: 'x', modo: 'collage' }, CONTEXTO);

    expect(resultado.efectos).toEqual([]);
    expect(resultado.paraElModelo).toMatchObject({ enviadas: 0, error: expect.any(String) as unknown });
  });

  it('su definición exige id_producto y un modo válido', () => {
    const { herramienta } = crear({} as ObtenerFotosProducto);

    expect(herramienta.definicion.nombre).toBe('enviar_fotos');
    expect(herramienta.definicion.esquema.safeParse({ id_producto: 'x', modo: 'collage' }).success).toBe(true);
    expect(herramienta.definicion.esquema.safeParse({ id_producto: 'x', modo: 'video' }).success).toBe(false);
    expect(herramienta.definicion.esquema.safeParse({ id_producto: 'x' }).success).toBe(false);
  });
});
