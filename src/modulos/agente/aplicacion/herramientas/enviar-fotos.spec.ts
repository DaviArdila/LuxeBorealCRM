import { ContadoresSesionEnMemoria } from '../../../../../test/fakes/contadores-sesion-en-memoria.js';
import { ProductoNoDisponible, type AnguloFoto, type ObtenerFotosProducto } from '../../../catalogo/index.js';
import { crearEnviarFotos } from './enviar-fotos.js';

// Escenarios AGT9 y AGT17 de `openspec/changes/fase-08b-comportamiento-agente/specs/agente/spec.md`.

const SESION = { conversacionId: 'conv-1', version: 0 };
const CONTEXTO = { sesion: SESION, contactoId: 'k', efectosPrevios: [] };
const LEYENDA = 'Anillo Aurora — Oro laminado 18k\n$389.000';

interface FotoFalsa {
  readonly claveObjeto: string;
  readonly angulo: AnguloFoto | null;
}

/** Doble de `ObtenerFotosProducto`: sin ángulo entrega la primera foto; con ángulo, la que coincida. */
function fotos(lista: readonly FotoFalsa[]) {
  const pedidos: (AnguloFoto | undefined)[] = [];
  const caso = {
    ejecutar: (_id: string, angulo?: AnguloFoto) => {
      pedidos.push(angulo);
      const foto = angulo === undefined ? lista[0] : lista.find((f) => f.angulo === angulo);
      const angulosDisponibles = [...new Set(lista.flatMap((f) => (f.angulo === null ? [] : [f.angulo])))];
      return Promise.resolve({ foto: foto ?? null, angulosDisponibles, leyenda: LEYENDA });
    },
  } as unknown as ObtenerFotosProducto;
  return { caso, pedidos };
}

function crear(caso: ObtenerFotosProducto, tope = 4) {
  const contadores = new ContadoresSesionEnMemoria();
  return { herramienta: crearEnviarFotos(caso, contadores, { AGENTE_FOTOS_INDIVIDUALES_MAX: tope }), contadores };
}

describe('modulos/agente/aplicacion/herramientas — enviar_fotos', () => {
  it('AGT9 — Sin ángulo se envía solo la portada', async () => {
    const { caso, pedidos } = fotos([
      { claveObjeto: 'portada.jpg', angulo: 'frente' },
      { claveObjeto: 'lado.jpg', angulo: 'lateral_izquierdo' },
      { claveObjeto: 'detalle.jpg', angulo: 'detalle' },
    ]);
    const { herramienta } = crear(caso);

    const resultado = await herramienta.ejecutar({ id_producto: 'SKU-1' }, CONTEXTO);

    expect(resultado.efectos).toEqual([{ tipo: 'enviar-imagen', claveObjeto: 'portada.jpg', leyenda: LEYENDA }]);
    expect(resultado.paraElModelo).toEqual({ enviadas: 1 });
    expect(pedidos).toEqual([undefined]);
  });

  it('AGT9 — Con ángulo se envía solo esa foto', async () => {
    const { caso, pedidos } = fotos([
      { claveObjeto: 'frente.jpg', angulo: 'frente' },
      { claveObjeto: 'lado.jpg', angulo: 'lateral_izquierdo' },
    ]);
    const { herramienta } = crear(caso);

    const resultado = await herramienta.ejecutar({ id_producto: 'SKU-1', angulo: 'lateral_izquierdo' }, CONTEXTO);

    expect(resultado.efectos).toEqual([{ tipo: 'enviar-imagen', claveObjeto: 'lado.jpg', leyenda: LEYENDA }]);
    expect(resultado.paraElModelo).toEqual({ enviadas: 1 });
    expect(pedidos).toEqual(['lateral_izquierdo']);
  });

  it('AGT9 — Un ángulo que el producto no tiene no envía nada y lo dice', async () => {
    const { caso } = fotos([{ claveObjeto: 'frente.jpg', angulo: 'frente' }]);
    const { herramienta, contadores } = crear(caso);

    const resultado = await herramienta.ejecutar({ id_producto: 'SKU-1', angulo: 'detalle' }, CONTEXTO);

    expect(resultado.efectos).toEqual([]);
    expect(resultado.paraElModelo).toMatchObject({ enviadas: 0, error: expect.stringContaining('frente') as unknown });
    expect(await contadores.fotosIndividuales(SESION)).toBe(0);
  });

  it('AGT9 — Las fotos enviadas respetan el tope de la sesión', async () => {
    const { caso, pedidos } = fotos([{ claveObjeto: 'f1.jpg', angulo: 'frente' }]);
    const { herramienta, contadores } = crear(caso, 2);
    await contadores.sumarFotosIndividuales(SESION, 2);

    const resultado = await herramienta.ejecutar({ id_producto: 'SKU-2' }, CONTEXTO);

    expect(resultado.efectos).toEqual([]);
    expect(resultado.paraElModelo).toMatchObject({ enviadas: 0, error: expect.any(String) as unknown });
    expect(pedidos).toEqual([]);
  });

  it('cada foto enviada suma uno al contador de la sesión y el modelo no ve claves ni URLs', async () => {
    const { caso } = fotos([{ claveObjeto: 'portada-secreta.jpg', angulo: null }]);
    const { herramienta, contadores } = crear(caso, 4);

    const resultado = await herramienta.ejecutar({ id_producto: 'SKU-1' }, CONTEXTO);

    expect(await contadores.fotosIndividuales(SESION)).toBe(1);
    expect(JSON.stringify(resultado.paraElModelo)).not.toContain('portada-secreta');
  });

  it('AGT9 — Un producto sin fotos no envía nada y lo dice', async () => {
    const { caso } = fotos([]);
    const { herramienta } = crear(caso);

    const resultado = await herramienta.ejecutar({ id_producto: 'SKU-3' }, CONTEXTO);

    expect(resultado.efectos).toEqual([]);
    expect(resultado.paraElModelo).toMatchObject({ enviadas: 0, error: expect.any(String) as unknown });
  });

  it('AGT17 — El efecto de imagen lleva el pie de foto del backend (herramienta)', async () => {
    const { caso } = fotos([{ claveObjeto: 'portada.jpg', angulo: 'frente' }]);
    const { herramienta } = crear(caso);

    const resultado = await herramienta.ejecutar({ id_producto: 'SKU-1' }, CONTEXTO);

    expect(resultado.efectos[0]).toMatchObject({ leyenda: LEYENDA });
    expect(JSON.stringify(resultado.paraElModelo)).not.toContain('Anillo');
  });

  it('un producto inexistente o inactivo no envía nada y lo dice', async () => {
    const caso = { ejecutar: () => Promise.reject(new ProductoNoDisponible()) } as unknown as ObtenerFotosProducto;
    const { herramienta } = crear(caso);

    const resultado = await herramienta.ejecutar({ id_producto: 'x' }, CONTEXTO);

    expect(resultado.efectos).toEqual([]);
    expect(resultado.paraElModelo).toMatchObject({ enviadas: 0, error: expect.any(String) as unknown });
  });

  it('su definición pide id_producto, acepta un ángulo válido opcional y ya no tiene modo', () => {
    const { herramienta } = crear({} as ObtenerFotosProducto);
    const { esquema } = herramienta.definicion;

    expect(herramienta.definicion.nombre).toBe('enviar_fotos');
    expect(esquema.safeParse({ id_producto: 'x' }).success).toBe(true);
    expect(esquema.safeParse({ id_producto: 'x', angulo: 'detalle' }).success).toBe(true);
    expect(esquema.safeParse({ id_producto: 'x', angulo: 'diagonal' }).success).toBe(false);
    expect(esquema.safeParse({}).success).toBe(false);
    expect(herramienta.definicion.esquemaJson).not.toHaveProperty('properties.modo');
    expect(herramienta.definicion.descripcion).not.toMatch(/collage/i);
  });
});
