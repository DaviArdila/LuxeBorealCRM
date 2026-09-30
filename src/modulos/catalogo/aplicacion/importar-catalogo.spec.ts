import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import type { CacheCatalogo } from '../puertos/cache-catalogo.js';
import type { FilaCruda, NombrePestana } from '../dominio/validar-catalogo.js';
import type { FuenteCatalogo } from '../puertos/fuente-catalogo.js';
import { ObjetoNoEncontrado, type Almacenamiento, type ObjetoAlmacenado } from '../../medios/index.js';
import type {
  DatosImportacion,
  EstadoProductoActual,
  RepositorioImportacionCatalogo,
  ResultadoImportacion,
} from '../puertos/repositorio-importacion.js';
import { RepositorioGeografiaEnMemoria } from '../../../../test/fakes/repositorio-geografia-en-memoria.js';
import { ClockFalso } from '../../../../test/fakes/clock-falso.js';
import { ProcesarFotos } from './procesar-fotos.js';
import { ResolverGeografiaImportacion } from './resolver-geografia-importacion.js';
import { ImportarCatalogo } from './importar-catalogo.js';

// T9 (fase-03-importador-medios): orquestador todo-o-nada completo, con dobles de los cuatro
// puertos que consume (FuenteCatalogo, RepositorioImportacionCatalogo, Almacenamiento,
// REPOSITORIO_GEOGRAFIA vía RepositorioGeografiaEnMemoria, ya usado por T4). `ResolverGeografiaImportacion`
// y `ProcesarFotos` son los colaboradores REALES (T8), no dobles — solo los puertos que ellos
// mismos inyectan se doblan, igual que indica el plan RED de `tasks.md`.

const PESTANAS_VACIAS: Record<NombrePestana, readonly FilaCruda[]> = {
  productos: [],
  tarifas: [],
  cobertura: [],
  parametros: [],
  excepciones_horario: [],
};

class FuenteCatalogoFalsa implements FuenteCatalogo {
  constructor(private readonly filasPorPestana: Partial<Record<NombrePestana, readonly FilaCruda[]>>) {}

  leerPestana(nombre: NombrePestana): Promise<readonly FilaCruda[]> {
    return Promise.resolve(this.filasPorPestana[nombre] ?? []);
  }
}

class RepositorioImportacionFalso implements RepositorioImportacionCatalogo {
  llamadasEscribir: DatosImportacion[] = [];
  constructor(
    private readonly estadoPrevio: ReadonlyMap<string, EstadoProductoActual> = new Map(),
    private readonly resultado: ResultadoImportacion = { productosActivados: 0, productosDesactivados: 0, fotosEscritas: 0 },
  ) {}

  leerEstadoActualPorSku(): Promise<ReadonlyMap<string, EstadoProductoActual>> {
    return Promise.resolve(this.estadoPrevio);
  }

  escribirTodoONada(datos: DatosImportacion): Promise<ResultadoImportacion> {
    this.llamadasEscribir.push(datos);
    return Promise.resolve(this.resultado);
  }
}

class AlmacenamientoEnMemoria implements Almacenamiento {
  readonly guardados = new Map<string, Buffer>();
  readonly clavesEliminadas: string[] = [];

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
    this.clavesEliminadas.push(clave);
    this.guardados.delete(clave);
    return Promise.resolve();
  }
}

class CacheCatalogoFalsa implements CacheCatalogo {
  invalidada = false;
  obtenerVigente(): Promise<null> {
    return Promise.resolve(null);
  }
  reemplazar(): Promise<void> {
    return Promise.resolve();
  }
  invalidar(): Promise<void> {
    this.invalidada = true;
    return Promise.resolve();
  }
}

interface OpcionesFetchFalso {
  readonly clavesExistentes: ReadonlySet<string>;
  readonly contenidoPorClave?: ReadonlyMap<string, Buffer>;
  readonly contenidoPorEnlace?: ReadonlyMap<string, Buffer>;
  readonly enlacesQueFallan?: ReadonlySet<string>;
}

/** Mismo patrón que `procesar-fotos.spec.ts` (T8): `ProcesarFotos` es un colaborador real, no un doble. */
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

    if (opciones.enlacesQueFallan?.has(url)) {
      // Simula el HTML de "acceso denegado" de Drive (MED4): ni las firmas JPEG/PNG/WEBP matchean.
      return { ok: true, arrayBuffer: () => Promise.resolve(Buffer.from('<html>denegado</html>')) } as unknown as Response;
    }

    const contenido = opciones.contenidoPorEnlace?.get(url);
    if (contenido === undefined) throw new Error(`fetch falso: sin contenido de enlace para "${url}"`);
    return { ok: true, arrayBuffer: () => Promise.resolve(contenido) } as unknown as Response;
  });
}

async function imagenDePrueba(): Promise<Buffer> {
  return sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 1, g: 2, b: 3 } } })
    .jpeg()
    .toBuffer();
}

function filaProducto(overrides: Partial<Record<string, string>> = {}): FilaCruda {
  return {
    sku: 'SKU-0001',
    nombre: 'Producto',
    descripcion_corta: 'corta',
    descripcion_larga: 'larga',
    precio_cop: '50000',
    activo: 'si',
    fotos: '',
    peso_gramos: '',
    largo_mm: '',
    ancho_mm: '',
    alto_mm: '',
    ...overrides,
  };
}

function crearOrquestador(opciones: {
  readonly fuente: FuenteCatalogo;
  readonly repositorioImportacion: RepositorioImportacionFalso;
  readonly almacenamiento: AlmacenamientoEnMemoria;
  readonly cacheCatalogo: CacheCatalogoFalsa;
  readonly geografia?: RepositorioGeografiaEnMemoria;
  readonly hoy?: Date;
}): ImportarCatalogo {
  const geografia = opciones.geografia ?? new RepositorioGeografiaEnMemoria();
  const resolverGeografia = new ResolverGeografiaImportacion(geografia);
  const procesarFotos = new ProcesarFotos(opciones.almacenamiento);
  const clock = new ClockFalso(opciones.hoy ?? new Date('2026-09-26T12:00:00.000Z'));

  return new ImportarCatalogo(
    opciones.fuente,
    resolverGeografia,
    opciones.repositorioImportacion,
    procesarFotos,
    opciones.almacenamiento,
    opciones.cacheCatalogo,
    clock,
  );
}

describe('catalogo/aplicacion/ImportarCatalogo', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('IMP10 — cualquier fila inválida o foto no descargable deja la base exactamente como estaba', () => {
    it('IMP10 — Un SKU repetido deja la base sin ningún cambio', async () => {
      const fuente = new FuenteCatalogoFalsa({
        ...PESTANAS_VACIAS,
        productos: [
          filaProducto({ sku: 'SKU-0001', activo: 'no', fotos: '' }),
          filaProducto({ sku: 'SKU-0001', activo: 'no', fotos: '' }),
        ],
      });
      const repositorioImportacion = new RepositorioImportacionFalso();
      const almacenamiento = new AlmacenamientoEnMemoria();
      const cacheCatalogo = new CacheCatalogoFalsa();
      const orquestador = crearOrquestador({ fuente, repositorioImportacion, almacenamiento, cacheCatalogo });

      const reporte = await orquestador.ejecutar();

      expect(reporte.valido).toBe(false);
      expect(reporte.errores.length).toBeGreaterThan(0);
      expect(repositorioImportacion.llamadasEscribir).toHaveLength(0);
      expect(cacheCatalogo.invalidada).toBe(false);
    });

    it('IMP10 — Una foto que no se puede descargar aborta la importación sin escribir nada', async () => {
      const enlace = 'https://cdn.tienda.com/no-disponible.jpg';
      vi.stubGlobal('fetch', fetchFalso({ clavesExistentes: new Set(), enlacesQueFallan: new Set([enlace]) }));
      const fuente = new FuenteCatalogoFalsa({
        ...PESTANAS_VACIAS,
        productos: [filaProducto({ fotos: enlace })],
      });
      const repositorioImportacion = new RepositorioImportacionFalso();
      const almacenamiento = new AlmacenamientoEnMemoria();
      const cacheCatalogo = new CacheCatalogoFalsa();
      const orquestador = crearOrquestador({ fuente, repositorioImportacion, almacenamiento, cacheCatalogo });

      const reporte = await orquestador.ejecutar();

      expect(reporte.valido).toBe(false);
      expect(reporte.erroresFotos.some((mensaje) => mensaje.includes(enlace))).toBe(true);
      expect(repositorioImportacion.llamadasEscribir).toHaveLength(0);
      expect(cacheCatalogo.invalidada).toBe(false);
    });

    it('IMP10 — Un departamento sin match DANE deja la base sin ningún cambio', async () => {
      const fuente = new FuenteCatalogoFalsa({
        ...PESTANAS_VACIAS,
        productos: [filaProducto({ activo: 'no', fotos: '' })],
        tarifas: [
          {
            departamento: 'Antioqia',
            ciudad: '',
            peso_min_g: '0',
            peso_max_g: '',
            rango_min_cop: '1000',
            rango_max_cop: '2000',
            dias_min: '1',
            dias_max: '2',
            contraentrega: 'si',
          },
        ],
      });
      const repositorioImportacion = new RepositorioImportacionFalso();
      const almacenamiento = new AlmacenamientoEnMemoria();
      const cacheCatalogo = new CacheCatalogoFalsa();
      const orquestador = crearOrquestador({ fuente, repositorioImportacion, almacenamiento, cacheCatalogo });

      const reporte = await orquestador.ejecutar();

      expect(reporte.valido).toBe(false);
      expect(reporte.errores.some((error) => error.mensaje.includes('Antioqia'))).toBe(true);
      expect(repositorioImportacion.llamadasEscribir).toHaveLength(0);
    });
  });

  it('IMP12 — Una importación exitosa invalida la caché de catálogo compacto', async () => {
    const fuente = new FuenteCatalogoFalsa({ ...PESTANAS_VACIAS, productos: [filaProducto({ activo: 'no', fotos: '' })] });
    const repositorioImportacion = new RepositorioImportacionFalso();
    const almacenamiento = new AlmacenamientoEnMemoria();
    const cacheCatalogo = new CacheCatalogoFalsa();
    const orquestador = crearOrquestador({ fuente, repositorioImportacion, almacenamiento, cacheCatalogo });

    const reporte = await orquestador.ejecutar();

    expect(reporte.valido).toBe(true);
    expect(repositorioImportacion.llamadasEscribir).toHaveLength(1);
    expect(cacheCatalogo.invalidada).toBe(true);
  });

  describe('IMP13 — --solo-validar', () => {
    it('IMP13 — --solo-validar reporta un catálogo válido sin escribir nada', async () => {
      const fuente = new FuenteCatalogoFalsa({ ...PESTANAS_VACIAS, productos: [filaProducto({ activo: 'no', fotos: '' })] });
      const repositorioImportacion = new RepositorioImportacionFalso();
      const almacenamiento = new AlmacenamientoEnMemoria();
      const cacheCatalogo = new CacheCatalogoFalsa();
      const orquestador = crearOrquestador({ fuente, repositorioImportacion, almacenamiento, cacheCatalogo });

      const reporte = await orquestador.ejecutar({ soloValidar: true });

      expect(reporte.valido).toBe(true);
      expect(repositorioImportacion.llamadasEscribir).toHaveLength(0);
      expect(cacheCatalogo.invalidada).toBe(false);
    });

    // Nota de desviación (reportada, no silenciosa — ver informe de `sdd-apply`): el escenario pide
    // que el comando reporte "ambos problemas" (un error de validación de una fila y, además, una
    // foto de OTRA fila que no se puede descargar) en la misma corrida. `validarCatalogoCompleto`
    // (T2, ya construido) devuelve `datos: null` en cuanto `errores.length > 0` — sin
    // `ProductoValidado[]` no hay nada que pasarle a `ProcesarFotos` (T8). `design.md` §"Data Flow"
    // confirma este orden explícitamente: "algún error → aborta, MUST NOT tocar fotos ni BD"
    // (IMP10). Cambiar ese contrato es una decisión de T2, fuera del alcance de esta tarea; este
    // test documenta el comportamiento real y honesto de esta arquitectura: el error de fila se
    // reporta, pero `erroresFotos` queda vacío porque `ProcesarFotos` nunca llega a ejecutarse.
    it('IMP13 — --solo-validar reporta los errores de validación y de fotos inaccesibles sin escribir nada', async () => {
      const enlace = 'https://cdn.tienda.com/no-disponible.jpg';
      vi.stubGlobal('fetch', fetchFalso({ clavesExistentes: new Set(), enlacesQueFallan: new Set([enlace]) }));
      const fuente = new FuenteCatalogoFalsa({
        ...PESTANAS_VACIAS,
        productos: [filaProducto({ sku: 'SKU-0001', nombre: '' }), filaProducto({ sku: 'SKU-0002', fotos: enlace })],
      });
      const repositorioImportacion = new RepositorioImportacionFalso();
      const almacenamiento = new AlmacenamientoEnMemoria();
      const cacheCatalogo = new CacheCatalogoFalsa();
      const orquestador = crearOrquestador({ fuente, repositorioImportacion, almacenamiento, cacheCatalogo });

      const reporte = await orquestador.ejecutar({ soloValidar: true });

      expect(reporte.valido).toBe(false);
      expect(reporte.errores.length).toBeGreaterThan(0);
      expect(reporte.erroresFotos).toEqual([]); // ver nota de desviación arriba: nunca se llega a ProcesarFotos
      expect(repositorioImportacion.llamadasEscribir).toHaveLength(0);
    });
  });

  it('MED7 — Un producto con menos fotos que antes borra las posiciones sobrantes del almacenamiento', async () => {
    const enlaceRestante = 'https://cdn.tienda.com/1.jpg';
    const contenido = await imagenDePrueba();
    const clavesPrevias = ['catalogo/SKU-0001/foto-1.jpg', 'catalogo/SKU-0001/foto-2.jpg', 'catalogo/SKU-0001/foto-3.jpg'];
    vi.stubGlobal(
      'fetch',
      fetchFalso({
        clavesExistentes: new Set(clavesPrevias),
        contenidoPorClave: new Map(clavesPrevias.slice(0, 2).map((clave) => [clave, contenido])),
        contenidoPorEnlace: new Map([[enlaceRestante, contenido]]),
      }),
    );
    const estadoPrevio = new Map<string, EstadoProductoActual>([
      [
        'SKU-0001',
        {
          fotos: clavesPrevias.map((claveArchivo, indice) => ({ orden: indice + 1, claveArchivo, origenUrl: enlaceRestante })),
          fotosHash: 'hash-previo-distinto',
          claveCollage: null,
        },
      ],
    ]);
    const fuente = new FuenteCatalogoFalsa({
      ...PESTANAS_VACIAS,
      productos: [filaProducto({ sku: 'SKU-0001', fotos: `${enlaceRestante}\n${enlaceRestante}` })],
    });
    const repositorioImportacion = new RepositorioImportacionFalso(estadoPrevio);
    const almacenamiento = new AlmacenamientoEnMemoria();
    const cacheCatalogo = new CacheCatalogoFalsa();
    const orquestador = crearOrquestador({ fuente, repositorioImportacion, almacenamiento, cacheCatalogo });

    await orquestador.ejecutar();

    expect(repositorioImportacion.llamadasEscribir).toHaveLength(1);
    expect(almacenamiento.clavesEliminadas).toEqual(['catalogo/SKU-0001/foto-3.jpg']);
  });
});
