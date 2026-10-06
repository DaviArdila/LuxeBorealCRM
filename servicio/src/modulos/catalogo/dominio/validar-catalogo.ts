/**
 * Validación pura del catálogo completo, pestaña por pestaña (IMP3-IMP8), antes de escribir nada
 * (IMP10). Portado de `../ChatLuxeCRM/src/catalogo/validar.ts` (límites de listas de WhatsApp,
 * parseo de dinero/fechas/enteros) a las cinco pestañas de esta fase y a `resolverLugar` (IMP9, D5)
 * para traducir departamento/ciudad de `tarifas`/`cobertura` a código DANE. Sin I/O: recibe
 * `hoy: Date` inyectado por la capa de aplicación (R16, nunca `Date.now()`/`new Date()` aquí). Solo
 * importa `resolver-lugar.ts` (mismo módulo `dominio/`, permitido por la regla `dominio-aislado`).
 *
 * Nota de desviación de `design.md` (reportada, no silenciosa): el contrato canónico de
 * `puertos/repositorio-importacion.ts` (T7, todavía no construido) tipa
 * `ResultadoValidacionCatalogo.datos` como `DatosImportacion` — pero ese tipo incluye
 * `claveCollage`/`fotosHash`/`fotos: NuevaFotoImportada[]`, campos que solo `ProcesarFotos` (T8)
 * puede calcular después de descargar y procesar las fotos (`design.md` §"Data Flow": primero
 * `validarCatalogoCompleto`, luego `ProcesarFotos.ejecutar(productosValidados, estadoPrevio)`).
 * Este módulo, aislado de `puertos/` por `dominio-aislado`, no podría importar ese tipo aunque
 * quisiera. `datos` se tipa aquí como `DatosCatalogoValidado`, con sus propios tipos locales
 * (`ProductoValidado`, `TarifaValidada`, etc.), estructuralmente equivalentes a los del puerto salvo
 * por lo que todavía no existe en esta etapa; `aplicacion/importar-catalogo.ts` (T9) combina este
 * resultado con el de `ProcesarFotos` (T8) para armar el `DatosImportacion` real que espera el
 * repositorio.
 *
 * Nota adicional: `puertos/repositorio-producto.ts`/`design.md` no listan un campo `activo` en
 * `NuevoProductoImportado`, aunque IMP4 exige leer y validar la columna `activo` de la hoja. Se
 * conserva aquí como `ProductoValidado.activo` (necesario para IMP4 y para que T9 decida qué
 * producto desactivar); T9 decide cómo lo traslada al puerto real.
 */

import { ANGULOS_FOTO, esAnguloFoto, type AnguloFoto } from './angulo-foto.js';
import { resolverLugar, type CatalogoLugares } from './resolver-lugar.js';

export type NombrePestana = 'productos' | 'tarifas' | 'cobertura' | 'parametros' | 'excepciones_horario';

export interface FilaCruda {
  readonly [columna: string]: string;
}

export interface ErrorValidacionFila {
  readonly pestana: NombrePestana;
  readonly fila: number; // 1-indexado, sin contar la cabecera (design.md)
  readonly columna: string;
  readonly mensaje: string;
}

export interface AdvertenciaValidacion {
  readonly pestana: NombrePestana;
  readonly fila: number;
  readonly mensaje: string;
}

export interface FotoValidada {
  readonly origenUrl: string;
  /** Qué muestra la foto (IMP14); nulo si la hoja no la etiquetó. */
  readonly angulo: AnguloFoto | null;
}

export interface ProductoValidado {
  readonly sku: string;
  readonly nombre: string;
  readonly descripcionCorta: string;
  readonly descripcionLarga: string;
  readonly precioCop: number;
  readonly activo: boolean;
  readonly pesoGramos: number | null;
  readonly largoMm: number | null;
  readonly anchoMm: number | null;
  readonly altoMm: number | null;
  readonly fotos: readonly FotoValidada[];
}

export interface TarifaValidada {
  readonly departamentoId: string | null; // null = nacional (sin departamento en la fila)
  readonly ciudadId: string | null; // null = tarifa por defecto del departamento
  readonly pesoMinG: number;
  readonly pesoMaxG: number | null; // null = sin límite superior
  readonly rangoMinCop: number;
  readonly rangoMaxCop: number;
  readonly diasMin: number;
  readonly diasMax: number;
  readonly contraentregaDisponible: boolean;
}

export interface ZonaSinCoberturaValidada {
  readonly departamentoId: string;
  readonly ciudadId: string | null; // null = todo el departamento
  readonly motivo: string | null;
}

export interface ParametroValidado {
  readonly clave: string;
  readonly valor: unknown; // jsonb ya serializado (IMP7)
}

export interface ExcepcionValidada {
  readonly fecha: Date;
  readonly motivo: string | null;
}

export interface DatosCatalogoValidado {
  readonly productos: readonly ProductoValidado[];
  readonly tarifas: readonly TarifaValidada[];
  readonly zonasSinCobertura: readonly ZonaSinCoberturaValidada[];
  readonly parametros: readonly ParametroValidado[];
  readonly excepciones: readonly ExcepcionValidada[];
}

export interface ResultadoValidacionCatalogo {
  readonly valido: boolean;
  readonly errores: readonly ErrorValidacionFila[];
  readonly advertencias: readonly AdvertenciaValidacion[];
  readonly datos: DatosCatalogoValidado | null;
}

/** Límites de listas interactivas de WhatsApp (IMP3), portados sin cambio del prototipo. */
const MAX_NOMBRE = 24;
const MAX_DESCRIPCION_CORTA = 72;
const MAX_FOTOS = 6;

const VALORES_SI = new Set(['si', 'sí', 's', 'true', '1', 'x', 'yes']);
const VALORES_NO = new Set(['no', 'n', 'false', '0']);

function err(errores: ErrorValidacionFila[], pestana: NombrePestana, fila: number, columna: string, mensaje: string): void {
  errores.push({ pestana, fila, columna, mensaje });
}

function aBooleano(valorCrudo: string, porDefecto: boolean): boolean | null {
  const v = valorCrudo.trim().toLowerCase();
  if (v === '') return porDefecto;
  if (VALORES_SI.has(v)) return true;
  if (VALORES_NO.has(v)) return false;
  return null;
}

/** "89.000", "89,000", "$ 89000", "89000" → 89000. `null` si no es un entero (incluye decimales). */
function aEnteroCop(valorCrudo: string): number | null {
  const limpio = valorCrudo.replace(/[$\s]/g, '').replace(/[.,](?=\d{3}(\D|$))/g, '');
  if (!/^\d+$/.test(limpio)) return null;
  return Number(limpio);
}

function aEntero(valorCrudo: string): number | null {
  const v = valorCrudo.trim();
  return /^\d+$/.test(v) ? Number(v) : null;
}

/** Entero opcional (peso, medidas, franjas): vacío → `null`; cualquier otra cosa no entera → `undefined` (error). */
function aEnteroOpcional(valorCrudo: string): number | null | undefined {
  const v = valorCrudo.trim();
  if (v === '') return null;
  return /^\d+$/.test(v) ? Number(v) : undefined;
}

/** Acepta `YYYY-MM-DD` y `DD/MM/YYYY`; rechaza fechas que no existen en el calendario (IMP8). */
function aFecha(valorCrudo: string): Date | null {
  const v = valorCrudo.trim();
  let anio: number;
  let mes: number;
  let dia: number;

  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (match) {
    [anio, mes, dia] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
    if (!match) return null;
    [dia, mes, anio] = [Number(match[1]), Number(match[2]), Number(match[3])];
  }

  const fecha = new Date(Date.UTC(anio, mes - 1, dia, 12));
  if (fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) return null;
  return fecha;
}

function esFechaPasada(fecha: Date, hoy: Date): boolean {
  const hoyUtc = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
  const fechaUtc = Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate());
  return fechaUtc < hoyUtc;
}

function separarEnlaces(valorCrudo: string): readonly string[] {
  return valorCrudo
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Lee la columna opcional `fotos_angulos` (IMP14): un ángulo por foto, separados por `;` y en el mismo orden
 * que `fotos`; un valor vacío deja esa foto sin ángulo. Un valor fuera de la lista o más ángulos que fotos
 * son errores de la fila (todo-o-nada, IMP10).
 */
function leerAngulos(
  errores: ErrorValidacionFila[],
  numeroFila: number,
  valorCrudo: string | undefined,
  totalFotos: number,
): readonly (AnguloFoto | null)[] {
  const crudos = (valorCrudo ?? '').split(/[\n;]/).map((s) => s.trim().toLowerCase());
  while (crudos.length > 0 && crudos[crudos.length - 1] === '') {
    crudos.pop();
  }
  if (crudos.length > totalFotos) {
    err(errores, 'productos', numeroFila, 'fotos_angulos', `${crudos.length} ángulos para ${totalFotos} foto(s)`);
  }
  return Array.from({ length: totalFotos }, (_, indice) => {
    const valor = crudos[indice] ?? '';
    if (valor === '') {
      return null;
    }
    if (!esAnguloFoto(valor)) {
      err(errores, 'productos', numeroFila, 'fotos_angulos', `"${valor}" no es un ángulo válido (${ANGULOS_FOTO.join(', ')})`);
      return null;
    }
    return valor;
  });
}

function leerEnteroOpcionalConError(
  errores: ErrorValidacionFila[],
  pestana: NombrePestana,
  fila: number,
  columna: string,
  valorCrudo: string | undefined,
): number | null {
  const resultado = aEnteroOpcional(valorCrudo ?? '');
  if (resultado === undefined) {
    err(errores, pestana, fila, columna, `"${valorCrudo ?? ''}" debe ser un entero (o vacío)`);
    return null;
  }
  return resultado;
}

// --- IMP3, IMP4, IMP5: pestaña `productos` -------------------------------------------------------

function validarProductos(filas: readonly FilaCruda[], errores: ErrorValidacionFila[]): readonly ProductoValidado[] {
  const productos: ProductoValidado[] = [];
  const skusVistos = new Map<string, number>();

  filas.forEach((filaCruda, indice) => {
    const numeroFila = indice + 1;

    const sku = (filaCruda.sku ?? '').trim().toUpperCase();
    if (sku === '') {
      err(errores, 'productos', numeroFila, 'sku', 'el SKU está vacío');
    } else if (!/^SKU-[A-Z0-9-]+$/.test(sku)) {
      err(errores, 'productos', numeroFila, 'sku', `"${sku}" debe tener la forma SKU-XXXX (letras, números y guiones)`);
    } else if (skusVistos.has(sku)) {
      err(errores, 'productos', numeroFila, 'sku', `repetido (ya aparece en la fila ${skusVistos.get(sku)})`);
    } else {
      skusVistos.set(sku, numeroFila);
    }

    const nombre = (filaCruda.nombre ?? '').trim();
    if (nombre === '') {
      err(errores, 'productos', numeroFila, 'nombre', 'el nombre está vacío');
    } else if (nombre.length > MAX_NOMBRE) {
      err(errores, 'productos', numeroFila, 'nombre', `${nombre.length} caracteres, máximo ${MAX_NOMBRE}`);
    }

    const descripcionCorta = (filaCruda.descripcion_corta ?? '').trim();
    if (descripcionCorta === '') {
      err(errores, 'productos', numeroFila, 'descripcion_corta', 'la descripción corta está vacía');
    } else if (descripcionCorta.length > MAX_DESCRIPCION_CORTA) {
      err(errores, 'productos', numeroFila, 'descripcion_corta', `${descripcionCorta.length} caracteres, máximo ${MAX_DESCRIPCION_CORTA}`);
    }

    const descripcionLarga = (filaCruda.descripcion_larga ?? '').trim();
    if (descripcionLarga === '') {
      err(errores, 'productos', numeroFila, 'descripcion_larga', 'la descripción larga está vacía');
    }

    const precioCop = aEnteroCop(filaCruda.precio_cop ?? '');
    if (precioCop === null || precioCop <= 0) {
      err(errores, 'productos', numeroFila, 'precio_cop', `"${filaCruda.precio_cop ?? ''}" debe ser un entero en pesos mayor que 0`);
    }

    const activo = aBooleano(filaCruda.activo ?? '', true) ?? true;

    const enlaces = separarEnlaces(filaCruda.fotos ?? '');
    if (activo) {
      if (enlaces.length === 0) {
        err(errores, 'productos', numeroFila, 'fotos', 'un producto activo necesita al menos 1 enlace de foto');
      } else if (enlaces.length > MAX_FOTOS) {
        err(errores, 'productos', numeroFila, 'fotos', `${enlaces.length} enlaces de foto, máximo ${MAX_FOTOS}`);
      }
    }
    const angulos = leerAngulos(errores, numeroFila, filaCruda.fotos_angulos, enlaces.length);
    for (const enlace of enlaces) {
      if (!/^https?:\/\//i.test(enlace)) {
        err(errores, 'productos', numeroFila, 'fotos', `"${enlace}" no es un enlace http(s)`);
      }
    }

    const pesoGramos = leerEnteroOpcionalConError(errores, 'productos', numeroFila, 'peso_gramos', filaCruda.peso_gramos);
    const largoMm = leerEnteroOpcionalConError(errores, 'productos', numeroFila, 'largo_mm', filaCruda.largo_mm);
    const anchoMm = leerEnteroOpcionalConError(errores, 'productos', numeroFila, 'ancho_mm', filaCruda.ancho_mm);
    const altoMm = leerEnteroOpcionalConError(errores, 'productos', numeroFila, 'alto_mm', filaCruda.alto_mm);

    productos.push({
      sku,
      nombre,
      descripcionCorta,
      descripcionLarga,
      precioCop: precioCop ?? 0,
      activo,
      pesoGramos,
      largoMm,
      anchoMm,
      altoMm,
      fotos: enlaces.map((origenUrl, indice) => ({ origenUrl, angulo: angulos[indice] ?? null })),
    });
  });

  return productos;
}

// --- IMP6, IMP9 (soporte): pestaña `tarifas` ------------------------------------------------------

interface DestinoResuelto {
  readonly departamentoId: string | null;
  readonly ciudadId: string | null;
}

/** `departamentoTexto` vacío = nacional (sin fila inválida); no vacío se resuelve con `resolverLugar` (IMP9). */
function resolverDestino(
  errores: ErrorValidacionFila[],
  pestana: NombrePestana,
  fila: number,
  columna: string,
  lugares: CatalogoLugares,
  departamentoTexto: string,
  ciudadTexto: string,
): DestinoResuelto | null {
  if (departamentoTexto === '') return { departamentoId: null, ciudadId: null };

  const resuelto = resolverLugar(lugares, departamentoTexto, ciudadTexto === '' ? null : ciudadTexto);
  if (resuelto === null) {
    err(errores, pestana, fila, columna, `"${departamentoTexto}" no coincide con ningún departamento o ciudad de la geografía (IMP9)`);
    return null;
  }
  return resuelto;
}

interface FranjaPeso {
  readonly min: number;
  readonly max: number | null;
}

function seSolapan(a: FranjaPeso, b: FranjaPeso): boolean {
  const maxA = a.max ?? Infinity;
  const maxB = b.max ?? Infinity;
  return a.min <= maxB && b.min <= maxA;
}

function validarTarifas(
  filas: readonly FilaCruda[],
  lugares: CatalogoLugares,
  errores: ErrorValidacionFila[],
): readonly TarifaValidada[] {
  const tarifas: TarifaValidada[] = [];
  const franjasPorDestino = new Map<string, FranjaPeso[]>();

  filas.forEach((filaCruda, indice) => {
    const numeroFila = indice + 1;
    const departamentoTexto = (filaCruda.departamento ?? '').trim();
    const ciudadTexto = (filaCruda.ciudad ?? '').trim();

    const destino = resolverDestino(errores, 'tarifas', numeroFila, 'departamento', lugares, departamentoTexto, ciudadTexto);

    const pesoMin = aEnteroOpcional(filaCruda.peso_min_g ?? '');
    const pesoMax = aEnteroOpcional(filaCruda.peso_max_g ?? '');
    if (pesoMin === undefined) {
      err(errores, 'tarifas', numeroFila, 'peso_min_g', `"${filaCruda.peso_min_g ?? ''}" debe ser un entero en gramos (o vacío)`);
    }
    if (pesoMax === undefined) {
      err(errores, 'tarifas', numeroFila, 'peso_max_g', `"${filaCruda.peso_max_g ?? ''}" debe ser un entero en gramos (o vacío)`);
    }
    const pesoMinG = pesoMin ?? 0;
    const pesoMaxG = pesoMax === undefined ? null : pesoMax;
    if (pesoMaxG !== null && pesoMinG > pesoMaxG) {
      err(errores, 'tarifas', numeroFila, 'peso_min_g', `la franja de peso está invertida (mínimo ${pesoMinG} mayor que máximo ${pesoMaxG})`);
    }

    const rangoMinCop = aEnteroCop(filaCruda.rango_min_cop ?? '');
    const rangoMaxCop = aEnteroCop(filaCruda.rango_max_cop ?? '');
    if (rangoMinCop === null) {
      err(errores, 'tarifas', numeroFila, 'rango_min_cop', `"${filaCruda.rango_min_cop ?? ''}" debe ser un entero en pesos`);
    }
    if (rangoMaxCop === null) {
      err(errores, 'tarifas', numeroFila, 'rango_max_cop', `"${filaCruda.rango_max_cop ?? ''}" debe ser un entero en pesos`);
    }
    if (rangoMinCop !== null && rangoMaxCop !== null && rangoMinCop > rangoMaxCop) {
      err(errores, 'tarifas', numeroFila, 'rango_min_cop', `el rango de precio está invertido (mínimo ${rangoMinCop} mayor que máximo ${rangoMaxCop})`);
    }

    const diasMin = aEntero(filaCruda.dias_min ?? '');
    const diasMax = aEntero(filaCruda.dias_max ?? '');
    if (diasMin === null) err(errores, 'tarifas', numeroFila, 'dias_min', 'debe ser un entero de días');
    if (diasMax === null) err(errores, 'tarifas', numeroFila, 'dias_max', 'debe ser un entero de días');
    if (diasMin !== null && diasMax !== null && diasMin > diasMax) {
      err(errores, 'tarifas', numeroFila, 'dias_min', `el rango de días está invertido (mínimo ${diasMin} mayor que máximo ${diasMax})`);
    }

    const contraentregaDisponible = aBooleano(filaCruda.contraentrega ?? '', true);
    if (contraentregaDisponible === null) {
      err(errores, 'tarifas', numeroFila, 'contraentrega', `"${filaCruda.contraentrega ?? ''}" debe ser sí/no`);
    }

    if (destino !== null) {
      const claveDestino = `${destino.departamentoId ?? 'NACIONAL'}::${destino.ciudadId ?? 'TODO'}`;
      const franjas = franjasPorDestino.get(claveDestino) ?? [];
      const franjaActual: FranjaPeso = { min: pesoMinG, max: pesoMaxG };
      if (franjas.some((franja) => seSolapan(franja, franjaActual))) {
        err(errores, 'tarifas', numeroFila, 'departamento', 'tarifa repetida: se solapa con otra franja de peso para el mismo destino');
      } else {
        franjas.push(franjaActual);
        franjasPorDestino.set(claveDestino, franjas);
      }
    }

    tarifas.push({
      departamentoId: destino?.departamentoId ?? null,
      ciudadId: destino?.ciudadId ?? null,
      pesoMinG,
      pesoMaxG,
      rangoMinCop: rangoMinCop ?? 0,
      rangoMaxCop: rangoMaxCop ?? 0,
      diasMin: diasMin ?? 0,
      diasMax: diasMax ?? 0,
      contraentregaDisponible: contraentregaDisponible ?? true,
    });
  });

  return tarifas;
}

// --- IMP9 (soporte): pestaña `cobertura` (Q2) -----------------------------------------------------

function validarCobertura(
  filas: readonly FilaCruda[],
  lugares: CatalogoLugares,
  errores: ErrorValidacionFila[],
): readonly ZonaSinCoberturaValidada[] {
  const zonas: ZonaSinCoberturaValidada[] = [];

  filas.forEach((filaCruda, indice) => {
    const numeroFila = indice + 1;
    const departamentoTexto = (filaCruda.departamento ?? '').trim();
    const ciudadTexto = (filaCruda.ciudad ?? '').trim();
    const motivo = (filaCruda.motivo ?? '').trim();

    if (departamentoTexto === '') {
      err(errores, 'cobertura', numeroFila, 'departamento', 'el departamento está vacío');
      return;
    }

    const destino = resolverDestino(errores, 'cobertura', numeroFila, 'departamento', lugares, departamentoTexto, ciudadTexto);
    if (destino === null || destino.departamentoId === null) return; // error ya registrado por resolverDestino

    zonas.push({
      departamentoId: destino.departamentoId,
      ciudadId: destino.ciudadId,
      motivo: motivo === '' ? null : motivo,
    });
  });

  return zonas;
}

// --- Filas de texto de `parametros.csv` (CFG6) ---------------------------------------------------------------------
// `parametro` guarda solo configuración del negocio. Los textos que lee el cliente son casos del asistente y el estilo del
// bot vive en `version_estilo`: una fila de texto invalida el lote entero, sin importar nada (todo o nada).

const PREFIJOS_DE_TEXTO = ['mensaje_', 'aviso_', 'politica_', 'prompt_estilo'] as const;

function esClaveDeTexto(clave: string): boolean {
  return PREFIJOS_DE_TEXTO.some((prefijo) => clave.startsWith(prefijo));
}

// --- IMP7: pestaña `parametros`, registro de parsers jsonb por clave conocida (Q3, R15) -----------

type ResultadoParseoParametro = { readonly valor: unknown } | { readonly error: string };

function parsearHorarioAtencion(valorCrudo: string): ResultadoParseoParametro {
  let objeto: unknown;
  try {
    objeto = JSON.parse(valorCrudo);
  } catch {
    return { error: 'debe ser JSON, ej. {"lun-vie":"08:00-18:00","sab":"09:00-13:00","dom":null}' };
  }
  if (typeof objeto !== 'object' || objeto === null || Array.isArray(objeto)) {
    return { error: 'debe ser un objeto JSON' };
  }
  for (const [clave, valor] of Object.entries(objeto as Record<string, unknown>)) {
    if (valor === null) continue;
    if (typeof valor !== 'string' || !/^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(valor)) {
      return { error: `"${clave}" debe ser "HH:MM-HH:MM" o null` };
    }
  }
  return { valor: objeto };
}

function parsearNumeroJsonb(valorCrudo: string): ResultadoParseoParametro {
  const normalizado = valorCrudo.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalizado)) {
    return { error: `"${valorCrudo}" debe ser un número` };
  }
  return { valor: Number(normalizado) };
}

/** Registro de parsers por clave conocida (Q3): una clave ausente de aquí solo genera advertencia. */
const PARSERS_PARAMETRO_CONOCIDO: Readonly<Record<string, (valorCrudo: string) => ResultadoParseoParametro>> = {
  horario_atencion: parsearHorarioAtencion,
  recargo_contraentrega_pct: parsearNumeroJsonb,
  factor_volumetrico: parsearNumeroJsonb,
};

function validarParametros(
  filas: readonly FilaCruda[],
  errores: ErrorValidacionFila[],
  advertencias: AdvertenciaValidacion[],
): readonly ParametroValidado[] {
  const parametros: ParametroValidado[] = [];

  filas.forEach((filaCruda, indice) => {
    const numeroFila = indice + 1;
    const clave = (filaCruda.clave ?? '').trim();
    const valorCrudo = (filaCruda.valor ?? '').trim();

    if (clave === '') {
      err(errores, 'parametros', numeroFila, 'clave', 'la clave está vacía');
      return;
    }

    if (esClaveDeTexto(clave)) {
      err(
        errores,
        'parametros',
        numeroFila,
        'clave',
        `"${clave}" es un texto del bot: los textos se editan en «Casos de uso» (o con npm run casos:sembrar), no en parametros.csv`,
      );
      return;
    }

    const parser = PARSERS_PARAMETRO_CONOCIDO[clave];
    if (parser === undefined) {
      advertencias.push({
        pestana: 'parametros',
        fila: numeroFila,
        mensaje: `la clave "${clave}" no está en el registro de claves conocidas; se guarda tal cual (IMP7)`,
      });
      parametros.push({ clave, valor: valorCrudo });
      return;
    }

    const resultado = parser(valorCrudo);
    if ('error' in resultado) {
      err(errores, 'parametros', numeroFila, 'valor', resultado.error);
      return;
    }
    parametros.push({ clave, valor: resultado.valor });
  });

  return parametros;
}

// --- IMP8: pestaña `excepciones_horario` ----------------------------------------------------------

function validarExcepciones(
  filas: readonly FilaCruda[],
  errores: ErrorValidacionFila[],
  advertencias: AdvertenciaValidacion[],
  hoy: Date,
): readonly ExcepcionValidada[] {
  const excepciones: ExcepcionValidada[] = [];

  filas.forEach((filaCruda, indice) => {
    const numeroFila = indice + 1;
    const fecha = aFecha(filaCruda.fecha ?? '');
    if (fecha === null) {
      err(errores, 'excepciones_horario', numeroFila, 'fecha', `"${filaCruda.fecha ?? ''}" debe ser YYYY-MM-DD o DD/MM/YYYY`);
      return;
    }

    if (esFechaPasada(fecha, hoy)) {
      advertencias.push({
        pestana: 'excepciones_horario',
        fila: numeroFila,
        mensaje: `la fecha ya pasó; IMP11 solo sincroniza las excepciones futuras, esta fila no reemplazará ningún historial`,
      });
    }

    const motivo = (filaCruda.motivo ?? '').trim();
    excepciones.push({ fecha, motivo: motivo === '' ? null : motivo });
  });

  return excepciones;
}

// --- Orquestador puro ------------------------------------------------------------------------------

/**
 * Valida las cinco pestañas del catálogo (IMP3-IMP9) antes de escribir nada (IMP10). `datos` viene
 * `null` cuando hay al menos un error — nunca se devuelven datos parcialmente válidos junto a errores
 * (Q1, IMP10).
 */
export function validarCatalogoCompleto(
  crudo: Readonly<Record<NombrePestana, readonly FilaCruda[]>>,
  lugares: CatalogoLugares,
  hoy: Date,
): ResultadoValidacionCatalogo {
  const errores: ErrorValidacionFila[] = [];
  const advertencias: AdvertenciaValidacion[] = [];

  const productos = validarProductos(crudo.productos, errores);
  const tarifas = validarTarifas(crudo.tarifas, lugares, errores);
  const zonasSinCobertura = validarCobertura(crudo.cobertura, lugares, errores);
  const parametros = validarParametros(crudo.parametros, errores, advertencias);
  const excepciones = validarExcepciones(crudo.excepciones_horario, errores, advertencias, hoy);

  const valido = errores.length === 0;
  return {
    valido,
    errores,
    advertencias,
    datos: valido ? { productos, tarifas, zonasSinCobertura, parametros, excepciones } : null,
  };
}
