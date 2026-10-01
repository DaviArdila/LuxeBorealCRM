import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { ObjetoNoEncontrado, type Almacenamiento, type ObjetoAlmacenado } from '../../medios/index.js';
import type { ProductoValidado } from '../dominio/validar-catalogo.js';
import type { EstadoProductoActual } from '../puertos/repositorio-importacion.js';
import { ProcesarFotos } from './procesar-fotos.js';

// T8 (fase-03-importador-medios): MED5 (idempotencia de descarga), MED6 (redimensionamiento) y MED9
// (regeneración de collage) — los 8 escenarios exactos de `tasks.md`. Sin infraestructura real: el
// puerto `Almacenamiento` se dobla en memoria, y el `fetch` global se dobla igual que ya lo hace
// `descarga-drive.spec.ts` (T6), porque tanto la comprobación de existencia (`HEAD`) como la lectura
// de una foto ya guardada para reconstruir el collage (`GET`) pasan por la URL pública del puerto,
// no por un método nuevo del puerto (nota de `tasks.md`, resolución de D8).

class AlmacenamientoEnMemoria implements Almacenamiento {
  readonly guardados = new Map<string, Buffer>();

  guardar(clave: string, contenido: Buffer): Promise<void> {
    this.guardados.set(clave, contenido);
    return Promise.resolve();
  }

  obtenerUrl(clave: string): Promise<string> {
    return Promise.resolve(`https://almacenamiento.prueba/${clave}`);
  }

  leer(clave: string): Promise<ObjetoAlmacenado> {
    const contenido = this.guardados.get(clave);
    return contenido === undefined
      ? Promise.reject(new ObjetoNoEncontrado(clave))
      : Promise.resolve({ contenido, contentType: 'image/jpeg' });
  }

  eliminar(clave: string): Promise<void> {
    this.guardados.delete(clave);
    return Promise.resolve();
  }
}

interface OpcionesFetchFalso {
  readonly clavesExistentes: ReadonlySet<string>;
  readonly contenidoPorClave?: ReadonlyMap<string, Buffer>;
  readonly contenidoPorEnlace?: ReadonlyMap<string, Buffer>;
}

function fetchFalso(opciones: OpcionesFetchFalso) {
  const PREFIJO = 'https://almacenamiento.prueba/';

  return vi.fn((entrada: string | URL, init?: RequestInit) => {
    const url = entrada.toString();

    if (url.startsWith(PREFIJO)) {
      const clave = url.slice(PREFIJO.length);
      if (init?.method === 'HEAD') {
        return { ok: opciones.clavesExistentes.has(clave) } as Response;
      }
      const contenido = opciones.contenidoPorClave?.get(clave);
      if (contenido === undefined) throw new Error(`fetch falso: sin contenido de almacenamiento para "${clave}"`);
      return { ok: true, arrayBuffer: () => Promise.resolve(contenido) } as unknown as Response;
    }

    const contenido = opciones.contenidoPorEnlace?.get(url);
    if (contenido === undefined) throw new Error(`fetch falso: sin contenido de enlace para "${url}"`);
    return { ok: true, arrayBuffer: () => Promise.resolve(contenido) } as unknown as Response;
  });
}

async function imagenDeColor(ancho: number, alto: number, color: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({ create: { width: ancho, height: alto, channels: 3, background: color } })
    .jpeg()
    .toBuffer();
}

function producto(sku: string, fotos: readonly string[]): ProductoValidado {
  return {
    sku,
    nombre: 'Producto de prueba',
    descripcionCorta: 'corta',
    descripcionLarga: 'larga',
    precioCop: 10000,
    activo: true,
    pesoGramos: null,
    largoMm: null,
    anchoMm: null,
    altoMm: null,
    fotos: fotos.map((origenUrl) => ({ origenUrl, angulo: null })),
  };
}

// Los escenarios de MED5/MED9 se ejercitan con el collage activo; IMP15 prueba el valor por defecto.
const CON_COLLAGE = { CATALOGO_GENERAR_COLLAGE: true };
const SIN_COLLAGE = { CATALOGO_GENERAR_COLLAGE: false };

const CLAVE_FOTO_1 = 'catalogo/SKU-1/foto-1.jpg';
const CLAVE_FOTO_2 = 'catalogo/SKU-1/foto-2.jpg';
const CLAVE_FOTO_3 = 'catalogo/SKU-1/foto-3.jpg';
const CLAVE_FOTO_4 = 'catalogo/SKU-1/foto-4.jpg';
const CLAVE_COLLAGE = 'catalogo/SKU-1/collage.jpg';

describe('catalogo/aplicacion/ProcesarFotos', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('MED5 — idempotencia de descarga', () => {
    it('MED5 — Una foto cuyo enlace no cambió y cuyo archivo existe no se vuelve a descargar', async () => {
      const enlace = 'https://cdn.tienda.com/1.jpg';
      const contenidoExistente = await imagenDeColor(800, 600, { r: 255, g: 0, b: 0 });
      vi.stubGlobal(
        'fetch',
        fetchFalso({
          clavesExistentes: new Set([CLAVE_FOTO_1]),
          contenidoPorClave: new Map([[CLAVE_FOTO_1, contenidoExistente]]),
        }),
      );
      const almacenamiento = new AlmacenamientoEnMemoria();
      const guardarEspiado = vi.spyOn(almacenamiento, 'guardar');
      const estadoPrevio = new Map<string, EstadoProductoActual>([
        [
          'SKU-1',
          {
            fotos: [{ orden: 1, claveArchivo: CLAVE_FOTO_1, origenUrl: enlace }],
            fotosHash: calcularHashDePrueba([enlace]),
            claveCollage: CLAVE_COLLAGE,
          },
        ],
      ]);
      const caso = new ProcesarFotos(almacenamiento, CON_COLLAGE);

      const resultado = await caso.ejecutar([producto('SKU-1', [enlace])], estadoPrevio);

      expect(guardarEspiado).not.toHaveBeenCalled();
      expect(resultado.productos[0]?.fotos).toEqual([
        { orden: 1, claveArchivo: CLAVE_FOTO_1, esPortada: true, origenUrl: enlace, angulo: null },
      ]);
    });

    it('MED5 — Una foto cuyo enlace cambió respecto a la importación anterior se redescarga', async () => {
      const enlaceAnterior = 'https://cdn.tienda.com/anterior.jpg';
      const enlaceNuevo = 'https://cdn.tienda.com/nuevo.jpg';
      const contenidoNuevo = await imagenDeColor(800, 600, { r: 0, g: 255, b: 0 });
      vi.stubGlobal(
        'fetch',
        fetchFalso({
          clavesExistentes: new Set([CLAVE_FOTO_1]),
          contenidoPorEnlace: new Map([[enlaceNuevo, contenidoNuevo]]),
        }),
      );
      const almacenamiento = new AlmacenamientoEnMemoria();
      const estadoPrevio = new Map<string, EstadoProductoActual>([
        [
          'SKU-1',
          {
            fotos: [{ orden: 1, claveArchivo: CLAVE_FOTO_1, origenUrl: enlaceAnterior }],
            fotosHash: 'hash-anterior',
            claveCollage: CLAVE_COLLAGE,
          },
        ],
      ]);
      const caso = new ProcesarFotos(almacenamiento, CON_COLLAGE);

      const resultado = await caso.ejecutar([producto('SKU-1', [enlaceNuevo])], estadoPrevio);

      expect(almacenamiento.guardados.has(CLAVE_FOTO_1)).toBe(true);
      expect(resultado.productos[0]?.fotos).toEqual([
        { orden: 1, claveArchivo: CLAVE_FOTO_1, esPortada: true, origenUrl: enlaceNuevo, angulo: null },
      ]);
    });

    it('MED5 — Una foto cuyo archivo ya no existe se redescarga aunque el enlace no haya cambiado', async () => {
      const enlace = 'https://cdn.tienda.com/1.jpg';
      const contenido = await imagenDeColor(800, 600, { r: 0, g: 0, b: 255 });
      vi.stubGlobal(
        'fetch',
        fetchFalso({
          clavesExistentes: new Set(), // el archivo ya no existe
          contenidoPorEnlace: new Map([[enlace, contenido]]),
        }),
      );
      const almacenamiento = new AlmacenamientoEnMemoria();
      const estadoPrevio = new Map<string, EstadoProductoActual>([
        [
          'SKU-1',
          {
            fotos: [{ orden: 1, claveArchivo: CLAVE_FOTO_1, origenUrl: enlace }],
            fotosHash: 'hash-sin-cambios',
            claveCollage: CLAVE_COLLAGE,
          },
        ],
      ]);
      const caso = new ProcesarFotos(almacenamiento, CON_COLLAGE);

      const resultado = await caso.ejecutar([producto('SKU-1', [enlace])], estadoPrevio);

      expect(almacenamiento.guardados.has(CLAVE_FOTO_1)).toBe(true);
      expect(resultado.productos[0]?.fotos).toEqual([
        { orden: 1, claveArchivo: CLAVE_FOTO_1, esPortada: true, origenUrl: enlace, angulo: null },
      ]);
    });
  });

  describe('IMP15 — el collage es opcional y está apagado por defecto', () => {
    async function procesar(config: { CATALOGO_GENERAR_COLLAGE: boolean }, cantidadFotos: number) {
      const enlaces = Array.from({ length: cantidadFotos }, (_, i) => `https://cdn.tienda.com/${String(i + 1)}.jpg`);
      const contenido = await imagenDeColor(500, 500, { r: 10, g: 120, b: 200 });
      vi.stubGlobal(
        'fetch',
        fetchFalso({ clavesExistentes: new Set(), contenidoPorEnlace: new Map(enlaces.map((e) => [e, contenido])) }),
      );
      const almacenamiento = new AlmacenamientoEnMemoria();
      const resultado = await new ProcesarFotos(almacenamiento, config).ejecutar([producto('SKU-1', enlaces)], new Map());
      return { resultado, almacenamiento };
    }

    it('IMP15 — Por defecto la importación no genera collage', async () => {
      const { resultado, almacenamiento } = await procesar(SIN_COLLAGE, 3);

      expect(resultado.productos[0]?.fotos).toHaveLength(3);
      expect(resultado.productos[0]?.claveCollage).toBeNull();
      expect(almacenamiento.guardados.has(CLAVE_COLLAGE)).toBe(false);
    });

    it('IMP15 — Con la variable activa la importación genera el collage', async () => {
      const { resultado, almacenamiento } = await procesar(CON_COLLAGE, 3);

      expect(resultado.productos[0]?.fotos).toHaveLength(3);
      expect(resultado.productos[0]?.claveCollage).toBe(CLAVE_COLLAGE);
      expect(almacenamiento.guardados.has(CLAVE_COLLAGE)).toBe(true);
    });

    it('con la variable activa, un producto de una sola foto no tiene collage (MED8)', async () => {
      const { resultado, almacenamiento } = await procesar(CON_COLLAGE, 1);

      expect(resultado.productos[0]?.claveCollage).toBeNull();
      expect(almacenamiento.guardados.has(CLAVE_COLLAGE)).toBe(false);
    });
  });

  describe('IMP14 — el ángulo viaja con la foto', () => {
    it('IMP14 — Los ángulos se guardan en el orden de las fotos (procesamiento)', async () => {
      const enlaces = ['https://cdn.tienda.com/a.jpg', 'https://cdn.tienda.com/b.jpg'];
      const contenido = await imagenDeColor(400, 400, { r: 0, g: 255, b: 0 });
      vi.stubGlobal(
        'fetch',
        fetchFalso({
          clavesExistentes: new Set(),
          contenidoPorEnlace: new Map(enlaces.map((e) => [e, contenido])),
        }),
      );
      const conAngulos: ProductoValidado = {
        ...producto('SKU-1', enlaces),
        fotos: [
          { origenUrl: enlaces[0] ?? '', angulo: 'frente' },
          { origenUrl: enlaces[1] ?? '', angulo: 'lateral_derecho' },
        ],
      };

      const resultado = await new ProcesarFotos(new AlmacenamientoEnMemoria(), CON_COLLAGE).ejecutar([conAngulos], new Map());

      expect(resultado.productos[0]?.fotos.map((f) => f.angulo)).toEqual(['frente', 'lateral_derecho']);
    });
  });

  describe('MED6 — redimensionamiento de las fotos originales', () => {
    it('MED6 — Una foto más grande que el límite se reduce a 1600 píxeles de lado más largo', async () => {
      const enlace = 'https://cdn.tienda.com/grande.jpg';
      const original = await imagenDeColor(3000, 2000, { r: 255, g: 255, b: 0 });
      vi.stubGlobal('fetch', fetchFalso({ clavesExistentes: new Set(), contenidoPorEnlace: new Map([[enlace, original]]) }));
      const almacenamiento = new AlmacenamientoEnMemoria();
      const caso = new ProcesarFotos(almacenamiento, CON_COLLAGE);

      await caso.ejecutar([producto('SKU-1', [enlace])], new Map());

      const guardado = almacenamiento.guardados.get(CLAVE_FOTO_1);
      expect(guardado).toBeDefined();
      const metadatos = await sharp(guardado).metadata();
      expect(metadatos.format).toBe('jpeg');
      expect(metadatos.width).toBe(1600);
      expect(metadatos.height).toBeLessThanOrEqual(1600);
    });

    it('MED6 — Una foto más pequeña que el límite no se agranda', async () => {
      const enlace = 'https://cdn.tienda.com/pequena.jpg';
      const original = await imagenDeColor(800, 600, { r: 0, g: 255, b: 255 });
      vi.stubGlobal('fetch', fetchFalso({ clavesExistentes: new Set(), contenidoPorEnlace: new Map([[enlace, original]]) }));
      const almacenamiento = new AlmacenamientoEnMemoria();
      const caso = new ProcesarFotos(almacenamiento, CON_COLLAGE);

      await caso.ejecutar([producto('SKU-1', [enlace])], new Map());

      const guardado = almacenamiento.guardados.get(CLAVE_FOTO_1);
      expect(guardado).toBeDefined();
      const metadatos = await sharp(guardado).metadata();
      expect(metadatos.format).toBe('jpeg');
      expect(metadatos.width).toBe(800);
      expect(metadatos.height).toBe(600);
    });
  });

  describe('MED9 — el collage solo se regenera si hubo fotos nuevas o cambió el hash de enlaces', () => {
    it('MED9 — Reimportar sin ningún cambio de fotos no regenera el collage', async () => {
      const enlaces = ['https://cdn.tienda.com/1.jpg', 'https://cdn.tienda.com/2.jpg', 'https://cdn.tienda.com/3.jpg', 'https://cdn.tienda.com/4.jpg'];
      const contenido = await imagenDeColor(400, 400, { r: 10, g: 20, b: 30 });
      const claves = [CLAVE_FOTO_1, CLAVE_FOTO_2, CLAVE_FOTO_3, CLAVE_FOTO_4];
      vi.stubGlobal(
        'fetch',
        fetchFalso({
          clavesExistentes: new Set(claves),
          contenidoPorClave: new Map(claves.map((clave) => [clave, contenido])),
        }),
      );
      const almacenamiento = new AlmacenamientoEnMemoria();
      const guardarEspiado = vi.spyOn(almacenamiento, 'guardar');
      const fotosPrevias = claves.map((claveArchivo, indice) => ({ orden: indice + 1, claveArchivo, origenUrl: enlaces[indice] }));
      const estadoPrevio = new Map<string, EstadoProductoActual>([
        [
          'SKU-1',
          {
            fotos: fotosPrevias,
            fotosHash: calcularHashDePrueba(enlaces),
            claveCollage: CLAVE_COLLAGE,
          },
        ],
      ]);
      const caso = new ProcesarFotos(almacenamiento, CON_COLLAGE);

      const resultado = await caso.ejecutar([producto('SKU-1', enlaces)], estadoPrevio);

      expect(guardarEspiado).not.toHaveBeenCalled();
      expect(resultado.productos[0]?.claveCollage).toBe(CLAVE_COLLAGE);
    });

    it('MED9 — Cambiar el enlace de una sola foto regenera el collage aunque las demás no cambien', async () => {
      const enlacesPrevios = ['https://cdn.tienda.com/1.jpg', 'https://cdn.tienda.com/2.jpg', 'https://cdn.tienda.com/3.jpg', 'https://cdn.tienda.com/4.jpg'];
      const enlaceNuevo = 'https://cdn.tienda.com/2-nuevo.jpg';
      const enlacesActuales = [enlacesPrevios[0], enlaceNuevo, enlacesPrevios[2], enlacesPrevios[3]];
      const contenidoExistente = await imagenDeColor(400, 400, { r: 10, g: 20, b: 30 });
      const contenidoNuevo = await imagenDeColor(400, 400, { r: 200, g: 20, b: 30 });
      const claves = [CLAVE_FOTO_1, CLAVE_FOTO_2, CLAVE_FOTO_3, CLAVE_FOTO_4];
      vi.stubGlobal(
        'fetch',
        fetchFalso({
          clavesExistentes: new Set(claves),
          contenidoPorClave: new Map([
            [CLAVE_FOTO_1, contenidoExistente],
            [CLAVE_FOTO_3, contenidoExistente],
            [CLAVE_FOTO_4, contenidoExistente],
          ]),
          contenidoPorEnlace: new Map([[enlaceNuevo, contenidoNuevo]]),
        }),
      );
      const almacenamiento = new AlmacenamientoEnMemoria();
      const fotosPrevias = claves.map((claveArchivo, indice) => ({ orden: indice + 1, claveArchivo, origenUrl: enlacesPrevios[indice] }));
      const estadoPrevio = new Map<string, EstadoProductoActual>([
        [
          'SKU-1',
          {
            fotos: fotosPrevias,
            fotosHash: calcularHashDePrueba(enlacesPrevios),
            claveCollage: CLAVE_COLLAGE,
          },
        ],
      ]);
      const caso = new ProcesarFotos(almacenamiento, CON_COLLAGE);

      const resultado = await caso.ejecutar([producto('SKU-1', enlacesActuales)], estadoPrevio);

      expect(almacenamiento.guardados.has(CLAVE_FOTO_2)).toBe(true); // la única redescargada
      expect(almacenamiento.guardados.has(CLAVE_COLLAGE)).toBe(true); // el collage se regeneró
      expect(resultado.productos[0]?.claveCollage).toBe(CLAVE_COLLAGE);
    });

    it('MED9 — Redescargar una foto por archivo faltante regenera el collage aunque el hash no haya cambiado', async () => {
      // Dos fotos: con una sola no hay collage (MED8). La posición 1 ya no existe; la 2 sí.
      const enlace1 = 'https://cdn.tienda.com/1.jpg';
      const enlace2 = 'https://cdn.tienda.com/2.jpg';
      const contenidoNuevo = await imagenDeColor(400, 400, { r: 50, g: 60, b: 70 });
      const contenidoFoto2 = await imagenDeColor(400, 400, { r: 90, g: 10, b: 10 });
      vi.stubGlobal(
        'fetch',
        fetchFalso({
          clavesExistentes: new Set([CLAVE_FOTO_2]),
          contenidoPorClave: new Map([[CLAVE_FOTO_2, contenidoFoto2]]),
          contenidoPorEnlace: new Map([[enlace1, contenidoNuevo]]),
        }),
      );
      const almacenamiento = new AlmacenamientoEnMemoria();
      const estadoPrevio = new Map<string, EstadoProductoActual>([
        [
          'SKU-1',
          {
            fotos: [
              { orden: 1, claveArchivo: CLAVE_FOTO_1, origenUrl: enlace1 },
              { orden: 2, claveArchivo: CLAVE_FOTO_2, origenUrl: enlace2 },
            ],
            fotosHash: calcularHashDePrueba([enlace1, enlace2]), // mismo hash: los enlaces no cambiaron
            claveCollage: CLAVE_COLLAGE,
          },
        ],
      ]);
      const caso = new ProcesarFotos(almacenamiento, CON_COLLAGE);

      const resultado = await caso.ejecutar([producto('SKU-1', [enlace1, enlace2])], estadoPrevio);

      expect(almacenamiento.guardados.has(CLAVE_FOTO_1)).toBe(true); // se redescargó
      expect(almacenamiento.guardados.has(CLAVE_COLLAGE)).toBe(true); // el collage se regeneró
      expect(resultado.productos[0]?.claveCollage).toBe(CLAVE_COLLAGE);
    });
  });
});

/** Reproduce exactamente el hash que `ProcesarFotos` calcula (SHA-256 de los `origenUrl` en orden, D8). */
function calcularHashDePrueba(enlaces: readonly string[]): string {
  return createHash('sha256').update(enlaces.join('\n')).digest('hex');
}
