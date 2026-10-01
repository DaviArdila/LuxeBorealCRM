import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { ALMACENAMIENTO, construirCollage, type Almacenamiento } from '../../medios/index.js';
import type { FotoValidada, ProductoValidado } from '../dominio/validar-catalogo.js';
import { descargarFoto } from '../infraestructura/descarga-drive.js';
import type { EstadoFotoActual, EstadoProductoActual, NuevaFotoImportada } from '../puertos/repositorio-importacion.js';

/** Lado más largo permitido tras redimensionar (MED6); nunca agranda una foto más pequeña. */
const LADO_MAX_FOTO_PX = 1600;
const CALIDAD_JPEG_FOTO = 80;

/**
 * Fotos ya procesadas de un producto (D7, D8): `ImportarCatalogo` (T9) combina esto con el resto de
 * `ProductoValidado` (T2) antes de llamar a `escribirTodoONada`.
 */
export interface ProductoConFotosProcesadas {
  readonly sku: string;
  readonly claveCollage: string | null;
  readonly fotosHash: string;
  readonly fotos: readonly NuevaFotoImportada[];
}

/**
 * Resultado completo de `ProcesarFotos.ejecutar` (D7): `clavesFotosABorrar` son las posiciones que
 * ya no están en la hoja actual — `ProcesarFotos` nunca llama a `ALMACENAMIENTO.eliminar`; el
 * borrado real lo ejecuta `ImportarCatalogo` (T9), solo después de que `escribirTodoONada` confirme.
 */
export interface ResultadoProcesarFotos {
  readonly productos: readonly ProductoConFotosProcesadas[];
  readonly clavesFotosABorrar: readonly string[];
}

interface DecisionFoto {
  readonly orden: number;
  readonly origenUrl: string;
  readonly claveArchivo: string;
  /** `null` cuando la foto no se redescargó en esta corrida (MED5): el buffer no está en memoria. */
  readonly bufferNuevo: Buffer | null;
}

/**
 * Orquesta el procesamiento de fotos de todos los productos validados de una importación
 * (`design.md` "Data Flow", D7, D8, MED5-MED9): decide qué fotos redescargar (D8, MED5), redimensiona
 * y sube las nuevas (MED6), regenera el collage solo cuando corresponde (D8, MED9), y devuelve tanto
 * las fotos procesadas como las claves sobrantes a borrar.
 *
 * La existencia de un archivo ya guardado se comprueba con una petición `HEAD` corriente contra su
 * URL pública (`ALMACENAMIENTO.obtenerUrl` + `fetch`), sin ampliar el puerto `Almacenamiento` con un
 * cuarto método (decisión de `tasks.md`, T8, que resuelve la pregunta que D8 dejaba abierta). El
 * mismo mecanismo, con `GET`, recupera el contenido de una foto que no cambió en esta corrida cuando
 * el collage necesita reconstruirse con las fotos de todas las posiciones aunque solo una se haya
 * redescargado (MED9, segundo escenario).
 */
@Injectable()
export class ProcesarFotos {
  constructor(@Inject(ALMACENAMIENTO) private readonly almacenamiento: Almacenamiento) {}

  async ejecutar(
    productos: readonly ProductoValidado[],
    estadoPrevio: ReadonlyMap<string, EstadoProductoActual>,
  ): Promise<ResultadoProcesarFotos> {
    const productosProcesados: ProductoConFotosProcesadas[] = [];
    const clavesFotosABorrar: string[] = [];

    for (const producto of productos) {
      const previo = estadoPrevio.get(producto.sku) ?? null;
      const { producto: productoProcesado, clavesABorrar } = await this.procesarProducto(producto, previo);
      productosProcesados.push(productoProcesado);
      clavesFotosABorrar.push(...clavesABorrar);
    }

    return { productos: productosProcesados, clavesFotosABorrar };
  }

  private async procesarProducto(
    producto: ProductoValidado,
    previo: EstadoProductoActual | null,
  ): Promise<{ producto: ProductoConFotosProcesadas; clavesABorrar: readonly string[] }> {
    const fotosPreviasPorOrden = new Map((previo?.fotos ?? []).map((foto) => [foto.orden, foto]));

    let huboFotoNueva = false;
    const decisiones: DecisionFoto[] = [];

    for (const [indice, foto] of producto.fotos.entries()) {
      const orden = indice + 1;
      const decision = await this.decidirFoto(producto.sku, orden, foto, fotosPreviasPorOrden.get(orden) ?? null);
      if (decision.bufferNuevo !== null) huboFotoNueva = true;
      decisiones.push(decision);
    }

    const fotosHash = calcularFotosHash(producto.fotos);
    const claveCollagePrevia = previo?.claveCollage ?? null;
    const debeRegenerarCollage =
      decisiones.length > 0 && (huboFotoNueva || fotosHash !== previo?.fotosHash || claveCollagePrevia === null);

    const claveCollage = debeRegenerarCollage
      ? await this.regenerarCollage(producto.sku, decisiones)
      : claveCollagePrevia;

    const fotos: readonly NuevaFotoImportada[] = decisiones.map((decision) => ({
      orden: decision.orden,
      claveArchivo: decision.claveArchivo,
      esPortada: decision.orden === 1,
      origenUrl: decision.origenUrl,
      angulo: producto.fotos[decision.orden - 1]?.angulo ?? null,
    }));

    const clavesABorrar = (previo?.fotos ?? [])
      .filter((fotoPrevia) => fotoPrevia.orden > producto.fotos.length)
      .map((fotoPrevia) => fotoPrevia.claveArchivo);

    return {
      producto: { sku: producto.sku, claveCollage, fotosHash, fotos },
      clavesABorrar,
    };
  }

  /** D8/MED5: redescarga solo si el enlace cambió, o si el enlace no cambió pero el archivo ya no existe. */
  private async decidirFoto(
    sku: string,
    orden: number,
    foto: FotoValidada,
    previa: EstadoFotoActual | null,
  ): Promise<DecisionFoto> {
    const claveArchivo = `catalogo/${sku}/foto-${orden}.jpg`;

    if (previa !== null && previa.origenUrl === foto.origenUrl && (await this.existeEnAlmacenamiento(previa.claveArchivo))) {
      return { orden, origenUrl: foto.origenUrl, claveArchivo: previa.claveArchivo, bufferNuevo: null };
    }

    const bufferOriginal = await descargarFoto(foto.origenUrl);
    const bufferRedimensionado = await redimensionarFoto(bufferOriginal);
    await this.almacenamiento.guardar(claveArchivo, bufferRedimensionado, 'image/jpeg');

    return { orden, origenUrl: foto.origenUrl, claveArchivo, bufferNuevo: bufferRedimensionado };
  }

  /** MED9: recompone el collage con las fotos de todas las posiciones, aunque solo alguna se haya redescargado. */
  private async regenerarCollage(sku: string, decisiones: readonly DecisionFoto[]): Promise<string> {
    const buffers = await Promise.all(
      decisiones.map((decision) =>
        decision.bufferNuevo !== null ? Promise.resolve(decision.bufferNuevo) : this.leerBufferExistente(decision.claveArchivo),
      ),
    );

    const bufferCollage = await construirCollage(buffers.map((buffer) => ({ buffer })));
    const claveCollage = `catalogo/${sku}/collage.jpg`;
    await this.almacenamiento.guardar(claveCollage, bufferCollage, 'image/jpeg');
    return claveCollage;
  }

  private async existeEnAlmacenamiento(clave: string): Promise<boolean> {
    const url = await this.almacenamiento.obtenerUrl(clave);
    const respuesta = await fetch(url, { method: 'HEAD' });
    return respuesta.ok;
  }

  private async leerBufferExistente(clave: string): Promise<Buffer> {
    const url = await this.almacenamiento.obtenerUrl(clave);
    const respuesta = await fetch(url);
    return Buffer.from(await respuesta.arrayBuffer());
  }
}

async function redimensionarFoto(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(LADO_MAX_FOTO_PX, LADO_MAX_FOTO_PX, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: CALIDAD_JPEG_FOTO })
    .toBuffer();
}

/** SHA-256 determinístico de los `origenUrl` en orden (D8), sin dependencia nueva (`node:crypto`). */
function calcularFotosHash(fotos: readonly FotoValidada[]): string {
  return createHash('sha256')
    .update(fotos.map((foto) => foto.origenUrl).join('\n'))
    .digest('hex');
}
