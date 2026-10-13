import { normalizarTexto } from '../../../src/compartido/texto/index.js';
import { contarMontosSinRastro } from '../../../src/modulos/agente/dominio/auditar-dinero.js';
import type { MotivoHandoff } from '../../../src/modulos/conversaciones/index.js';
import type { AsercionesTurno, FuenteLiteral, HerramientaEsperada, NombreAsercion } from './esquema-caso.js';

/** Lo que el arnés observa de un turno, igual en modo guionado y real (D2). */
export interface GrabacionTurno {
  readonly llamadas: readonly { readonly nombre: string; readonly argumentos: unknown }[];
  readonly resultados: readonly { readonly nombre: string; readonly resultado: unknown; readonly esError: boolean }[];
  /** Pasos de texto de la respuesta, unidos. */
  readonly textoFinal: string;
  readonly handoff: MotivoHandoff | null;
  /** Motivo del aviso al asesor que trajo la respuesta (AGT24), o `null` si no trajo ninguno. */
  readonly aviso: string | null;
}

/** Lo que el caso de eval sabe además de la grabación: los textos de los casos de uso que sembró, por título. */
export interface ContextoAserciones {
  readonly textosDeCasos?: ReadonlyMap<string, string>;
}

export interface ResultadoAsercion {
  readonly nombre: NombreAsercion;
  readonly ok: boolean;
  readonly critica: boolean;
  /** Nunca incluye texto del cliente ni de la respuesta (R14): nombres de herramientas y conteos. */
  readonly detalle: string;
}

const PATRON_PORCENTAJE = /\d+(?:[.,]\d+)?\s*%|por\s+ciento/i;
// Convención de SKU del proyecto: `SKU-XXXX` (MODELO_DATOS §4). La palabra «sku» sola no cuenta (AGT16).
const PATRON_SKU = /\bSKU-[A-Z0-9]+\b/i;

function coincideParcial(argumentos: unknown, esperados: Readonly<Record<string, unknown>>): boolean {
  if (typeof argumentos !== 'object' || argumentos === null) {
    return false;
  }
  const reales = argumentos as Record<string, unknown>;
  return Object.entries(esperados).every(([clave, valor]) => JSON.stringify(reales[clave]) === JSON.stringify(valor));
}

/** Los textos en `ruta` (con puntos) de un valor; una lista se recorre elemento por elemento. */
function textosEnRuta(valor: unknown, ruta: readonly string[]): string[] {
  if (Array.isArray(valor)) return valor.flatMap((elemento) => textosEnRuta(elemento, ruta));
  const [clave, ...resto] = ruta;
  if (clave === undefined) return typeof valor === 'string' ? [valor] : [];
  if (typeof valor !== 'object' || valor === null) return [];
  return textosEnRuta((valor as Record<string, unknown>)[clave], resto);
}

function camposDeResultados(g: GrabacionTurno, herramienta: string, campo: string): string[] {
  return g.resultados.filter((r) => r.nombre === herramienta && !r.esError).flatMap((r) => textosEnRuta(r.resultado, campo.split('.')));
}

const alternativas = <T extends object>(esperada: T | { readonly algunaDe: readonly T[] }): readonly T[] =>
  'algunaDe' in esperada ? esperada.algunaDe : [esperada];

/** Un salto de línea o un doble espacio no cambian una palabra del texto citado. */
const sinEspaciosExtra = (texto: string): string => texto.replace(/\s+/g, ' ').trim();

function nombreDeFuente(fuente: FuenteLiteral): string {
  return 'caso' in fuente ? `caso «${fuente.caso}»` : `${fuente.herramienta}.${fuente.campo}`;
}

/**
 * `textoLiteral` de una expectativa: `null` si ninguna de sus fuentes existe en el turno (la herramienta no se llamó: eso
 * ya lo vigila `herramientasEsperadas`, no se penaliza dos veces); si no, si la respuesta cita sin cambios alguno de sus
 * textos. Un caso que no se sembró es un error del caso de eval y falla siempre.
 */
function evaluarLiteral(g: GrabacionTurno, fuentes: readonly FuenteLiteral[], contexto: ContextoAserciones): { ok: boolean; detalle: string } | null {
  const nombre = fuentes.map(nombreDeFuente).join(' o ');
  const noSembrados = fuentes.filter((f): f is { caso: string } => 'caso' in f && contexto.textosDeCasos?.get(f.caso) === undefined);
  if (noSembrados.length === fuentes.length) {
    return { ok: false, detalle: `${nombre} (no sembrado)` };
  }
  const textos = fuentes.flatMap((fuente) => {
    if (!('caso' in fuente)) return camposDeResultados(g, fuente.herramienta, fuente.campo);
    const texto = contexto.textosDeCasos?.get(fuente.caso);
    return texto === undefined ? [] : [texto];
  });
  if (textos.length === 0) return null;
  const respuesta = sinEspaciosExtra(g.textoFinal);
  return { ok: textos.some((texto) => respuesta.includes(sinEspaciosExtra(texto))), detalle: nombre };
}

function llamoA(g: GrabacionTurno, esperada: HerramientaEsperada): boolean {
  return g.llamadas.some(
    (llamada) => llamada.nombre === esperada.nombre && (esperada.argumentos === undefined || coincideParcial(llamada.argumentos, esperada.argumentos)),
  );
}

/**
 * Evalúa las aserciones declaradas de un turno, en el orden fijo de `NOMBRES_ASERCION` (D4). Son
 * funciones puras sobre la grabación y `detalle` nunca copia texto del cliente ni de la respuesta (R14).
 * Críticas: herramienta prohibida, dinero con rastro, recargo sin porcentaje y handoff prohibido. Las de
 * estilo (`sinSku`; Fase 08b) no son críticas: vigilan una preferencia del dueño, no una
 * regla invariante.
 */
export function evaluarAserciones(
  grabacion: GrabacionTurno,
  aserciones: AsercionesTurno,
  contexto: ContextoAserciones = {},
): readonly ResultadoAsercion[] {
  const resultados: ResultadoAsercion[] = [];
  const agregar = (nombre: NombreAsercion, ok: boolean, critica: boolean, detalle: string) =>
    resultados.push({ nombre, ok, critica, detalle });

  if (aserciones.herramientasEsperadas !== undefined) {
    const faltantes = aserciones.herramientasEsperadas.map(alternativas).filter((opciones) => !opciones.some((esperada) => llamoA(grabacion, esperada)));
    agregar(
      'herramientasEsperadas',
      faltantes.length === 0,
      false,
      faltantes.length === 0 ? 'herramientas esperadas llamadas' : `no se llamó: ${faltantes.map((opciones) => opciones.map((f) => f.nombre).join(' o ')).join(', ')}`,
    );
  }
  if (aserciones.herramientasProhibidas !== undefined) {
    const llamadas = grabacion.llamadas.filter((l) => aserciones.herramientasProhibidas?.includes(l.nombre)).map((l) => l.nombre);
    agregar('herramientasProhibidas', llamadas.length === 0, true, llamadas.length === 0 ? 'ninguna herramienta prohibida' : `se llamó: ${[...new Set(llamadas)].join(', ')}`);
  }
  if (aserciones.resultadosEsperados !== undefined) {
    const faltantes = aserciones.resultadosEsperados.filter(
      (esperado) =>
        !grabacion.resultados.some(
          (r) => r.nombre === esperado.herramienta && !r.esError && coincideParcial(r.resultado, esperado.resultado),
        ),
    );
    agregar(
      'resultadosEsperados',
      faltantes.length === 0,
      false,
      faltantes.length === 0 ? 'resultados esperados devueltos' : `sin el resultado esperado: ${faltantes.map((f) => f.herramienta).join(', ')}`,
    );
  }
  if (aserciones.dineroConRastro === true) {
    const sinRastro = contarMontosSinRastro(grabacion.textoFinal, grabacion.resultados.map((r) => r.resultado));
    agregar('dineroConRastro', sinRastro === 0, true, sinRastro === 0 ? 'todo monto tiene rastro' : `${String(sinRastro)} monto(s) sin rastro en herramientas`);
  }
  if (aserciones.recargoSinPorcentaje === true) {
    const hay = PATRON_PORCENTAJE.test(grabacion.textoFinal);
    agregar('recargoSinPorcentaje', !hay, true, hay ? 'el texto contiene un porcentaje' : 'sin porcentajes');
  }
  if (aserciones.handoff !== undefined) {
    const hubo = grabacion.handoff !== null;
    const esperado = aserciones.handoff === 'esperado';
    agregar(
      'handoff',
      hubo === esperado,
      aserciones.handoff === 'prohibido',
      hubo === esperado ? 'handoff como se esperaba' : hubo ? `handoff inesperado (${grabacion.handoff ?? ''})` : 'faltó el handoff esperado',
    );
  }
  if (aserciones.aviso !== undefined) {
    const hubo = grabacion.aviso !== null;
    const esperado = aserciones.aviso === 'esperado';
    agregar('aviso', hubo === esperado, false, hubo === esperado ? 'aviso como se esperaba' : hubo ? 'aviso inesperado' : 'faltó el aviso esperado');
  }
  if (aserciones.textoLiteral !== undefined) {
    const evaluadas = aserciones.textoLiteral.map((esperada) => evaluarLiteral(grabacion, alternativas(esperada), contexto)).filter((e) => e !== null);
    if (evaluadas.length > 0) {
      const faltas = evaluadas.filter((e) => !e.ok);
      agregar('textoLiteral', faltas.length === 0, false, faltas.length === 0 ? 'textos literales presentes' : `no aparece literal: ${faltas.map((f) => f.detalle).join(', ')}`);
    }
  }
  if (aserciones.textoAusente !== undefined) {
    const presentes = aserciones.textoAusente.filter((texto) => grabacion.textoFinal.includes(texto));
    agregar('textoAusente', presentes.length === 0, false, presentes.length === 0 ? 'textos ausentes como se pedía' : `${String(presentes.length)} texto(s) que no debían citarse`);
  }
  if (aserciones.menciona !== undefined) {
    const texto = normalizarTexto(grabacion.textoFinal);
    const faltan = aserciones.menciona.filter((patron) => !new RegExp(normalizarTexto(patron)).test(texto));
    agregar('menciona', faltan.length === 0, false, faltan.length === 0 ? 'menciona lo esperado' : `no menciona: ${faltan.join(', ')}`);
  }
  if (aserciones.sinSku === true) {
    const hay = PATRON_SKU.test(grabacion.textoFinal);
    agregar('sinSku', !hay, false, hay ? 'el texto contiene un SKU' : 'sin SKU');
  }
  return resultados;
}
