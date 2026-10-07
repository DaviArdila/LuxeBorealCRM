import { describe, expect, it } from 'vitest';
import type { PerfilUsuario } from '../../usuarios/index.js';
import type { AdministrarSeccionesEstilo } from '../aplicacion/administrar-secciones-estilo.js';
import type { ListarHistorialEstilo } from '../aplicacion/listar-historial-estilo.js';
import type { ProveedorEstilo } from '../aplicacion/proveedor-estilo.js';
import type { PublicarEstilo, ResultadoPublicacion } from '../aplicacion/publicar-estilo.js';
import type { RestaurarEstilo } from '../aplicacion/restaurar-estilo.js';
import type { ResultadoCambioSecciones, SeccionEstilo } from '../puertos/repositorio-secciones-estilo.js';
import { EstiloController } from './estilo.controller.js';

// AGT23 (T2): el controlador solo traduce los resultados de los casos de uso a respuestas HTTP y errores de catálogo.

const admin: PerfilUsuario = { id: '0199a000-0000-7000-8000-000000000001', nombre: 'Dueño', email: 'a@b.co', rol: 'admin' };

const ID_A = '0199a000-0000-7000-8000-0000000000a1';
const ID_B = '0199a000-0000-7000-8000-0000000000b2';
const ACTUALIZADO = '2026-10-07T10:00:00.000Z';

function seccion(parcial: Partial<SeccionEstilo> = {}): SeccionEstilo {
  return {
    id: ID_A,
    titulo: 'Saludo',
    texto: 'Hola, soy Luna.',
    orden: 1,
    activo: true,
    creado: new Date('2026-10-07T09:00:00.000Z'),
    actualizado: new Date(ACTUALIZADO),
    ...parcial,
  };
}

function crear(opciones: {
  readonly vigente?: { texto: string; version: number; origen: 'base' | 'archivo'; publicadoPor?: { id: string; nombre: string } };
  readonly historial?: { version: number; texto: string; fecha: string; publicadoPor?: { id: string; nombre: string } }[];
  readonly publicacion?: ResultadoPublicacion;
  readonly secciones?: readonly SeccionEstilo[];
  readonly cambio?: ResultadoCambioSecciones<unknown>;
} = {}) {
  const llamadas: string[] = [];
  const autores: ({ id: string; nombre: string } | undefined)[] = [];
  const proveedor = {
    obtener: () => Promise.resolve(opciones.vigente ?? { texto: 'Estilo del archivo', version: 0, origen: 'archivo' as const }),
  } as Pick<ProveedorEstilo, 'obtener'>;
  const listar = {
    ejecutar: () => Promise.resolve({ vigente: null, historial: opciones.historial ?? [] }),
  } as Pick<ListarHistorialEstilo, 'ejecutar'>;
  const publicar = {
    ejecutar: (texto: string, autor?: { id: string; nombre: string }) => {
      llamadas.push(`publicar:${texto}`);
      autores.push(autor);
      return Promise.resolve(opciones.publicacion ?? { publicado: true as const, version: 4 });
    },
  } as Pick<PublicarEstilo, 'ejecutar'>;
  const restaurar = {
    ejecutar: (version: number, autor?: { id: string; nombre: string }) => {
      llamadas.push(`restaurar:${String(version)}`);
      autores.push(autor);
      return Promise.resolve(opciones.publicacion ?? { publicado: true as const, version: 4 });
    },
  } as Pick<RestaurarEstilo, 'ejecutar'>;
  const secciones = opciones.secciones ?? [];
  const cambio = (valor: unknown): Promise<ResultadoCambioSecciones<unknown>> =>
    Promise.resolve(opciones.cambio ?? { ok: true as const, valor, version: 5 });
  const administrar = {
    listar: () => Promise.resolve(secciones),
    crear: (entrada: { titulo: string }, autor?: { id: string; nombre: string }) => {
      llamadas.push(`crear:${entrada.titulo}`);
      autores.push(autor);
      return cambio(seccion({ titulo: entrada.titulo }));
    },
    editar: (id: string, entrada: { titulo: string; texto: string; activo: boolean }, leido: Date, autor?: { id: string; nombre: string }) => {
      llamadas.push(`editar:${id}:${entrada.titulo}|${entrada.texto}|${String(entrada.activo)}|${leido.toISOString()}`);
      autores.push(autor);
      return cambio(seccion({ id, ...entrada }));
    },
    reordenar: (ids: readonly string[], autor?: { id: string; nombre: string }) => {
      llamadas.push(`reordenar:${ids.join(',')}`);
      autores.push(autor);
      return cambio(secciones);
    },
  } as unknown as Pick<AdministrarSeccionesEstilo, 'listar' | 'crear' | 'editar' | 'reordenar'>;
  const controlador = new EstiloController(
    proveedor as ProveedorEstilo,
    listar as ListarHistorialEstilo,
    publicar as PublicarEstilo,
    restaurar as RestaurarEstilo,
    administrar as AdministrarSeccionesEstilo,
  );
  return { controlador, llamadas, autores };
}

describe('EstiloController (AGT23)', () => {
  it('AGT23 — Un admin consulta el estilo vigente: versión, origen y texto', async () => {
    const { controlador } = crear({ vigente: { texto: 'Estilo tres', version: 3, origen: 'base' } });

    await expect(controlador.obtenerEstilo()).resolves.toEqual({ version: 3, origen: 'base', texto: 'Estilo tres', publicadoPor: null });
  });

  it('AGT23 — Sin estilo publicado la versión es null y el origen es archivo', async () => {
    const { controlador } = crear();

    await expect(controlador.obtenerEstilo()).resolves.toEqual({ version: null, origen: 'archivo', texto: 'Estilo del archivo', publicadoPor: null });
  });

  it('el historial se entrega con versión, fecha, texto y autor, en el orden del caso de uso', async () => {
    const historial = [
      { version: 2, texto: 'Dos', fecha: '2026-10-02T10:00:00.000Z' },
      { version: 1, texto: 'Uno', fecha: '2026-10-01T10:00:00.000Z' },
    ];
    const { controlador } = crear({ historial });

    await expect(controlador.listarHistorialEstilo()).resolves.toEqual({ versiones: historial.map((v) => ({ ...v, publicadoPor: null })) });
  });

  it('publicar entrega la versión nueva', async () => {
    const { controlador, llamadas } = crear();

    await expect(controlador.publicarEstilo({ texto: 'Estilo nuevo' }, admin)).resolves.toEqual({ version: 4 });
    expect(llamadas).toEqual(['publicar:Estilo nuevo']);
  });

  it('AGT23 — Un estilo inválido responde estilo-invalido con el motivo en el detalle', async () => {
    const { controlador } = crear({ publicacion: { publicado: false, motivo: 'el estilo contiene un valor en pesos (R1, R2)', razon: 'invalido' } });

    await expect(controlador.publicarEstilo({ texto: 'Cuesta $ 5' }, admin)).rejects.toMatchObject({
      codigo: 'estilo-invalido',
      detalle: 'el estilo contiene un valor en pesos (R1, R2)',
    });
  });

  it('AGT23 — Restaurar entrega la versión nueva', async () => {
    const { controlador, llamadas } = crear();

    await expect(controlador.restaurarEstilo({ version: 1 }, admin)).resolves.toEqual({ version: 4 });
    expect(llamadas).toEqual(['restaurar:1']);
  });

  it('AGT23 — Restaurar una versión que no existe responde version-estilo-inexistente', async () => {
    const { controlador } = crear({ publicacion: { publicado: false, motivo: 'la versión 9 no está en el historial', razon: 'version-inexistente' } });

    await expect(controlador.restaurarEstilo({ version: 9 }, admin)).rejects.toMatchObject({
      codigo: 'version-estilo-inexistente',
      detalle: 'la versión 9 no está en el historial',
    });
  });

  it('restaurar una versión cuyo texto hoy sería inválido responde estilo-invalido', async () => {
    const { controlador } = crear({ publicacion: { publicado: false, motivo: 'el estilo contiene un SKU (AGT16)', razon: 'invalido' } });

    await expect(controlador.restaurarEstilo({ version: 1 }, admin)).rejects.toMatchObject({ codigo: 'estilo-invalido' });
  });
  it('EST-D3 — La consulta del vigente trae el nombre y el identificador de quien lo publicó', async () => {
    const ana = { id: '0199a000-0000-7000-8000-00000000000a', nombre: 'Ana' };
    const { controlador } = crear({ vigente: { texto: 'Estilo tres', version: 3, origen: 'base', publicadoPor: ana } });

    await expect(controlador.obtenerEstilo()).resolves.toMatchObject({ version: 3, publicadoPor: ana });
  });

  it('EST-D3 — El historial muestra el autor de cada versión y null si la publicó el comando', async () => {
    const ana = { id: '0199a000-0000-7000-8000-00000000000a', nombre: 'Ana' };
    const { controlador } = crear({
      historial: [
        { version: 2, texto: 'Dos', fecha: '2026-10-02T10:00:00.000Z', publicadoPor: ana },
        { version: 1, texto: 'Uno', fecha: '2026-10-01T10:00:00.000Z' },
      ],
    });

    const { versiones } = await controlador.listarHistorialEstilo();

    expect(versiones.map((v) => v.publicadoPor)).toEqual([ana, null]);
  });

  it('EST-D3 — Publicar y restaurar registran al usuario de la sesión como autor', async () => {
    const { controlador, autores } = crear();

    await controlador.publicarEstilo({ texto: 'Estilo nuevo' }, admin);
    await controlador.restaurarEstilo({ version: 1 }, admin);

    expect(autores).toEqual([
      { id: admin.id, nombre: admin.nombre },
      { id: admin.id, nombre: admin.nombre },
    ]);
  });

  describe('secciones del estilo (EST-API)', () => {
    it('EST-API — Listar entrega las secciones con su fecha, el largo del compuesto y el máximo', async () => {
      const { controlador } = crear({
        secciones: [seccion(), seccion({ id: ID_B, titulo: 'Cierre', texto: 'Quedo atenta.', orden: 2, activo: false })],
      });

      const respuesta = await controlador.listarSeccionesEstilo();

      expect(respuesta.secciones).toEqual([
        { id: ID_A, titulo: 'Saludo', texto: 'Hola, soy Luna.', orden: 1, activo: true, actualizado: ACTUALIZADO },
        { id: ID_B, titulo: 'Cierre', texto: 'Quedo atenta.', orden: 2, activo: false, actualizado: ACTUALIZADO },
      ]);
      expect(respuesta.caracteresCompuestos).toBe('# Saludo\n\nHola, soy Luna.'.length);
      expect(respuesta.maximo).toBe(4000);
    });

    it('EST-API — Crear entrega la sección con autor de la sesión y activa por defecto', async () => {
      const { controlador, llamadas, autores } = crear();

      const creada = await controlador.crearSeccionEstilo({ titulo: 'Tono', texto: 'Cercano.' }, admin);

      expect(creada).toMatchObject({ titulo: 'Tono', activo: true });
      expect(llamadas).toEqual(['crear:Tono']);
      expect(autores).toEqual([{ id: admin.id, nombre: admin.nombre }]);
    });

    it('EST-API — Editar combina lo enviado con lo guardado y manda la fecha leída', async () => {
      const { controlador, llamadas } = crear({ secciones: [seccion()] });

      await controlador.editarSeccionEstilo(ID_A, { actualizado: ACTUALIZADO, texto: 'Nuevo texto.' }, admin);

      expect(llamadas).toEqual([`editar:${ID_A}:Saludo|Nuevo texto.|true|${ACTUALIZADO}`]);
    });

    it('EST-API — Editar una sección que no existe responde seccion-inexistente', async () => {
      const { controlador } = crear({ secciones: [] });

      await expect(controlador.editarSeccionEstilo(ID_A, { actualizado: ACTUALIZADO, activo: false }, admin)).rejects.toMatchObject({
        codigo: 'seccion-inexistente',
      });
    });

    it.each([
      ['inexistente', 'seccion-inexistente'],
      ['modificado', 'seccion-modificada'],
      ['duplicada', 'seccion-duplicada'],
    ] as const)('EST-API — El motivo %s se traduce al código %s', async (razon, codigo) => {
      const { controlador } = crear({ secciones: [seccion()], cambio: { ok: false, razon } });

      await expect(controlador.editarSeccionEstilo(ID_A, { actualizado: ACTUALIZADO, titulo: 'X' }, admin)).rejects.toMatchObject({ codigo });
    });

    it('EST-API — Una sección o un compuesto inválido responde estilo-invalido con el motivo', async () => {
      const { controlador } = crear({ cambio: { ok: false, razon: 'invalido', motivo: 'el estilo supera 4000 caracteres' } });

      await expect(controlador.crearSeccionEstilo({ titulo: 'Tono', texto: 'x' }, admin)).rejects.toMatchObject({
        codigo: 'estilo-invalido',
        detalle: 'el estilo supera 4000 caracteres',
      });
    });

    it('EST-API — Reordenar entrega la lista nueva y una lista que no coincide responde orden-secciones-invalido', async () => {
      const ok = crear({ secciones: [seccion({ id: ID_B }), seccion()] });
      const { secciones } = await ok.controlador.reordenarSeccionesEstilo({ ids: [ID_B, ID_A] }, admin);
      expect(secciones.map((s) => s.id)).toEqual([ID_B, ID_A]);
      expect(ok.llamadas).toEqual([`reordenar:${ID_B},${ID_A}`]);

      const mal = crear({ cambio: { ok: false, razon: 'no-coincide' } });
      await expect(mal.controlador.reordenarSeccionesEstilo({ ids: [ID_A] }, admin)).rejects.toMatchObject({
        codigo: 'orden-secciones-invalido',
      });
    });
  });
});
