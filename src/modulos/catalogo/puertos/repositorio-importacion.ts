/**
 * Puerto de escritura del importador de catálogo (design.md D6, D8, "Interfaces / Contracts").
 * `leerEstadoActualPorSku` es una simple lectura, fuera de cualquier transacción (D8: insumo de
 * `ProcesarFotos`, T8, para decidir qué fotos redescargar). `escribirTodoONada` es la única
 * escritura: una sola `$transaction` interna (D6) con las seis operaciones de IMP11. Ningún caso
 * de uso de `aplicacion/` ve un cliente Prisma (regla de fronteras
 * `prisma-service-solo-en-infraestructura`); solo conoce este puerto.
 */

/** Token de inyección del puerto {@link RepositorioImportacionCatalogo}. */
export const REPOSITORIO_IMPORTACION_CATALOGO = Symbol('REPOSITORIO_IMPORTACION_CATALOGO');

/** Foto guardada en una importación anterior, tal como quedó en `foto` (D8, MED5/MED9). */
export interface EstadoFotoActual {
  readonly orden: number;
  readonly claveArchivo: string;
  readonly origenUrl: string | null;
}

/** Estado previo de un producto por SKU, leído antes de procesar ninguna foto (D8). */
export interface EstadoProductoActual {
  readonly fotos: readonly EstadoFotoActual[];
  readonly fotosHash: string | null;
  readonly claveCollage: string | null;
}

/** Foto ya procesada (descargada/redimensionada/subida por `ProcesarFotos`, T8), lista para escribir. */
export interface NuevaFotoImportada {
  readonly orden: number;
  readonly claveArchivo: string;
  readonly esPortada: boolean;
  readonly origenUrl: string;
}

/** Producto validado (T2) y con sus fotos ya procesadas (T8), listo para `escribirTodoONada`. */
export interface NuevoProductoImportado {
  readonly sku: string;
  readonly nombre: string;
  readonly descripcionCorta: string;
  readonly descripcionLarga: string;
  readonly precioCop: number;
  /** `activo = no` explícito de una fila presente en la hoja (IMP4); distinto de un SKU ausente (IMP11). */
  readonly activo: boolean;
  readonly pesoGramos: number | null;
  readonly largoMm: number | null;
  readonly anchoMm: number | null;
  readonly altoMm: number | null;
  readonly claveCollage: string | null;
  readonly fotosHash: string;
  readonly fotos: readonly NuevaFotoImportada[];
}

/** Tarifa validada (T2, IMP6/IMP9): `departamentoId`/`ciudadId` en `null` = tarifa nacional. */
export interface NuevaTarifaImportada {
  readonly departamentoId: string | null;
  readonly ciudadId: string | null;
  readonly pesoMinG: number;
  readonly pesoMaxG: number | null;
  readonly rangoMinCop: number;
  readonly rangoMaxCop: number;
  readonly diasMin: number;
  readonly diasMax: number;
  readonly contraentregaDisponible: boolean;
}

/** Zona sin cobertura validada (T2, IMP9): `ciudadId` en `null` = todo el departamento. */
export interface NuevaZonaSinCoberturaImportada {
  readonly departamentoId: string;
  readonly ciudadId: string | null;
  readonly motivo: string | null;
}

/** Parámetro validado y serializado a jsonb (T2, IMP7). */
export interface NuevoParametroImportado {
  readonly clave: string;
  readonly valor: unknown;
}

/** Excepción de horario validada (T2, IMP8); `escribirTodoONada` filtra las futuras (D6, `hoy`). */
export interface NuevaExcepcionImportada {
  readonly fecha: Date;
  readonly motivo: string | null;
}

/** Datos completos de una importación, ya validados (T2) y con fotos procesadas (T8). */
export interface DatosImportacion {
  readonly productos: readonly NuevoProductoImportado[];
  readonly tarifas: readonly NuevaTarifaImportada[];
  readonly zonasSinCobertura: readonly NuevaZonaSinCoberturaImportada[];
  readonly parametros: readonly NuevoParametroImportado[];
  readonly excepciones: readonly NuevaExcepcionImportada[];
}

/** Resumen de lo escrito por `escribirTodoONada`, para el reporte del comando CLI (T10, IMP13). */
export interface ResultadoImportacion {
  readonly productosActivados: number;
  readonly productosDesactivados: number;
  readonly fotosEscritas: number;
}

export interface RepositorioImportacionCatalogo {
  /** Estado previo por SKU, leído fuera de cualquier transacción (D8, MED5/MED9). */
  leerEstadoActualPorSku(): Promise<ReadonlyMap<string, EstadoProductoActual>>;
  /** Una sola `$transaction` interna (D6); nunca deja escritura parcial (IMP10, IMP11). */
  escribirTodoONada(datos: DatosImportacion, hoy: Date): Promise<ResultadoImportacion>;
}
