import { Inject, Injectable, Optional } from '@nestjs/common';
import { ALMACENAMIENTO, type Almacenamiento } from '../../medios/index.js';
import { CLOCK, type Clock } from '../../../plataforma/reloj/index.js';
import {
  validarCatalogoCompleto,
  type AdvertenciaValidacion,
  type ErrorValidacionFila,
  type FilaCruda,
  type NombrePestana,
} from '../dominio/validar-catalogo.js';
import { CACHE_CATALOGO, type CacheCatalogo } from '../puertos/cache-catalogo.js';
import { FUENTE_CATALOGO, type FuenteCatalogo } from '../puertos/fuente-catalogo.js';
import {
  REPOSITORIO_IMPORTACION_CATALOGO,
  type DatosImportacion,
  type NuevoProductoImportado,
  type RepositorioImportacionCatalogo,
  type ResultadoImportacion,
} from '../puertos/repositorio-importacion.js';
import { ProcesarFotos } from './procesar-fotos.js';
import { ResolverGeografiaImportacion } from './resolver-geografia-importacion.js';

/** Las cinco pestañas fijas del catálogo (IMP1), en el orden en que se leen. */
const PESTANAS: readonly NombrePestana[] = ['productos', 'tarifas', 'cobertura', 'parametros', 'excepciones_horario'];

export interface OpcionesImportacion {
  /** IMP13: valida y comprueba fotos, pero MUST NOT escribir nada en la base de datos. */
  readonly soloValidar?: boolean;
}

/**
 * Resultado de `ImportarCatalogo.ejecutar` (sin contrato canónico en `design.md`, que no fija la
 * forma de retorno del orquestador — decisión propia de esta tarea, documentada aquí en vez de en
 * `design.md`): separa los errores de validación de fila (T2, `ErrorValidacionFila`) de las fotos
 * que no se pudieron descargar (T8, mensajes de `descarga-drive.ts`/`ProcesarFotos`), porque una
 * foto inaccesible no tiene un número de fila de validación propio que citar — el escenario IMP10
 * solo exige que el mensaje "cite ese enlace", lo que ya hacen `EnlaceCarpetaDrive`/`ImagenInvalida`/
 * `EsquemaNoPermitido` (T6) en su `.message`. `resultado` es `null` cuando hubo error o cuando
 * `opciones.soloValidar` terminó la corrida antes de escribir (IMP10, IMP13).
 */
export interface ReporteImportacion {
  readonly valido: boolean;
  readonly errores: readonly ErrorValidacionFila[];
  readonly erroresFotos: readonly string[];
  readonly advertencias: readonly AdvertenciaValidacion[];
  readonly resultado: ResultadoImportacion | null;
}

/**
 * Orquestador todo-o-nada del importador de catálogo (design.md §"Data Flow", D6, D7, D8): lee las
 * cinco pestañas, resuelve geografía (D5), valida (IMP3-IMP9), procesa fotos (MED2-MED9) y —salvo
 * `--solo-validar` (IMP13)— escribe todo dentro de una sola transacción (IMP11), borra las fotos
 * sobrantes solo tras el éxito de esa escritura (D7, MED7) e invalida `CACHE_CATALOGO` (IMP12).
 * Ningún error de validación ni foto inaccesible llega a `escribirTodoONada` (IMP10).
 *
 * Nota de deviación (reportada, no silenciosa): `FUENTE_CATALOGO` no se registra en
 * `catalogo.module.ts` — a diferencia de `REPOSITORIO_IMPORTACION_CATALOGO` (fijo, siempre
 * `RepositorioImportacionPrisma`), el adaptador de `FuenteCatalogo` (Sheets vs. Directorio) depende
 * de qué flag de CLI (`--sheet-id`/`--dir`) usó el usuario en esa corrida — una elección en tiempo
 * de ejecución que solo conoce el comando (T10), no el módulo estático. `catalogo.module.ts`
 * expone el token para que el contexto de aplicación del CLI (`ContextoImportacionCatalogo`, T10)
 * lo provea con el adaptador correcto antes de construir `ImportarCatalogo`.
 */
@Injectable()
export class ImportarCatalogo {
  constructor(
    // Opcional: solo el comando de importación conoce el origen (Sheets o directorio). En la app, donde
    // `AgenteModule` importa `CatalogoModule` solo por las consultas, no hay fuente y `ejecutar` lo dice.
    @Optional() @Inject(FUENTE_CATALOGO) private readonly fuenteCatalogo: FuenteCatalogo | undefined,
    private readonly resolverGeografiaImportacion: ResolverGeografiaImportacion,
    @Inject(REPOSITORIO_IMPORTACION_CATALOGO) private readonly repositorioImportacion: RepositorioImportacionCatalogo,
    private readonly procesarFotos: ProcesarFotos,
    @Inject(ALMACENAMIENTO) private readonly almacenamiento: Almacenamiento,
    @Inject(CACHE_CATALOGO) private readonly cacheCatalogo: CacheCatalogo,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async ejecutar(opciones: OpcionesImportacion = {}): Promise<ReporteImportacion> {
    const crudo = await this.leerPestanas();
    const lugares = await this.resolverGeografiaImportacion.ejecutar();
    const hoy = this.clock.ahora();

    const validacion = validarCatalogoCompleto(crudo, lugares, hoy);
    if (!validacion.valido || validacion.datos === null) {
      return {
        valido: false,
        errores: validacion.errores,
        erroresFotos: [],
        advertencias: validacion.advertencias,
        resultado: null,
      };
    }

    const estadoPrevio = await this.repositorioImportacion.leerEstadoActualPorSku();

    let resultadoFotos: Awaited<ReturnType<ProcesarFotos['ejecutar']>>;
    try {
      resultadoFotos = await this.procesarFotos.ejecutar(validacion.datos.productos, estadoPrevio);
    } catch (error) {
      // IMP10: ninguna foto inaccesible llega a tocar la base de datos.
      return {
        valido: false,
        errores: validacion.errores,
        erroresFotos: [mensajeDeError(error)],
        advertencias: validacion.advertencias,
        resultado: null,
      };
    }

    if (opciones.soloValidar === true) {
      // IMP13: catálogo y fotos válidos, pero MUST NOT llamar escribirTodoONada.
      return {
        valido: true,
        errores: [],
        erroresFotos: [],
        advertencias: validacion.advertencias,
        resultado: null,
      };
    }

    const fotosProcesadasPorSku = new Map(resultadoFotos.productos.map((producto) => [producto.sku, producto]));
    const datosImportacion: DatosImportacion = {
      productos: validacion.datos.productos.map((producto): NuevoProductoImportado => {
        const fotosProcesadas = fotosProcesadasPorSku.get(producto.sku);
        if (fotosProcesadas === undefined) {
          // No debería ocurrir: ProcesarFotos.ejecutar procesa exactamente los mismos productos que
          // recibe, en el mismo orden. Se falla ruidosamente en vez de escribir datos incompletos.
          throw new Error(`ProcesarFotos no devolvió resultado para el SKU "${producto.sku}"`);
        }
        return {
          sku: producto.sku,
          nombre: producto.nombre,
          descripcionCorta: producto.descripcionCorta,
          descripcionLarga: producto.descripcionLarga,
          precioCop: producto.precioCop,
          activo: producto.activo,
          pesoGramos: producto.pesoGramos,
          largoMm: producto.largoMm,
          anchoMm: producto.anchoMm,
          altoMm: producto.altoMm,
          claveCollage: fotosProcesadas.claveCollage,
          fotosHash: fotosProcesadas.fotosHash,
          fotos: fotosProcesadas.fotos,
        };
      }),
      tarifas: validacion.datos.tarifas,
      zonasSinCobertura: validacion.datos.zonasSinCobertura,
      parametros: validacion.datos.parametros,
      excepciones: validacion.datos.excepciones,
    };

    const resultado = await this.repositorioImportacion.escribirTodoONada(datosImportacion, hoy);

    // D7/MED7: el borrado de fotos sobrantes ocurre solo después de que la transacción confirmó.
    for (const clave of resultadoFotos.clavesFotosABorrar) {
      await this.almacenamiento.eliminar(clave);
    }

    // IMP12: reutiliza la invalidación de Fase 02, sin reimplementar nada.
    await this.cacheCatalogo.invalidar();

    return {
      valido: true,
      errores: [],
      erroresFotos: [],
      advertencias: validacion.advertencias,
      resultado,
    };
  }

  private async leerPestanas(): Promise<Readonly<Record<NombrePestana, readonly FilaCruda[]>>> {
    const fuente = this.fuenteCatalogo;
    if (fuente === undefined) {
      throw new Error('ImportarCatalogo necesita FUENTE_CATALOGO: solo el comando catalogo:importar la provee.');
    }
    const entradas = await Promise.all(
      PESTANAS.map(async (pestana) => [pestana, await fuente.leerPestana(pestana)] as const),
    );
    return Object.fromEntries(entradas) as Readonly<Record<NombrePestana, readonly FilaCruda[]>>;
  }
}

function mensajeDeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
