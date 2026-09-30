import { normalizarTexto } from '../../../src/compartido/texto/index.js';
import { contarMontosSinRastro } from '../../../src/modulos/agente/dominio/auditar-dinero.js';
import type { MotivoHandoff } from '../../../src/modulos/conversaciones/index.js';
import type { AsercionesTurno, NombreAsercion } from './esquema-caso.js';

/** Lo que el arnés observa de un turno, igual en modo guionado y real (D2). */
export interface GrabacionTurno {
  readonly llamadas: readonly { readonly nombre: string; readonly argumentos: unknown }[];
  readonly resultados: readonly { readonly nombre: string; readonly resultado: unknown; readonly esError: boolean }[];
  /** Pasos de texto de la respuesta, unidos. */
  readonly textoFinal: string;
  readonly handoff: MotivoHandoff | null;
}

export interface ResultadoAsercion {
  readonly nombre: NombreAsercion;
  readonly ok: boolean;
  readonly critica: boolean;
  /** Nunca incluye texto del cliente ni de la respuesta (R14): nombres de herramientas y conteos. */
  readonly detalle: string;
}

const PATRON_PORCENTAJE = /\d+(?:[.,]\d+)?\s*%|por\s+ciento/i;

function coincideParcial(argumentos: unknown, esperados: Readonly<Record<string, unknown>>): boolean {
  if (typeof argumentos !== 'object' || argumentos === null) {
    return false;
  }
  const reales = argumentos as Record<string, unknown>;
  return Object.entries(esperados).every(([clave, valor]) => JSON.stringify(reales[clave]) === JSON.stringify(valor));
}

function camposDeResultados(g: GrabacionTurno, herramienta: string, campo: string): string[] {
  return g.resultados
    .filter((r) => r.nombre === herramienta && !r.esError)
    .flatMap((r) => {
      const valor = (r.resultado as Record<string, unknown> | null)?.[campo];
      return typeof valor === 'string' ? [valor] : [];
    });
}

/**
 * Evalúa las aserciones declaradas de un turno, en el orden fijo de `NOMBRES_ASERCION` (D4). Son
 * funciones puras sobre la grabación y `detalle` nunca copia texto del cliente ni de la respuesta (R14).
 * Críticas: herramienta prohibida, dinero con rastro, recargo sin porcentaje y handoff prohibido.
 */
export function evaluarAserciones(grabacion: GrabacionTurno, aserciones: AsercionesTurno): readonly ResultadoAsercion[] {
  const resultados: ResultadoAsercion[] = [];
  const agregar = (nombre: NombreAsercion, ok: boolean, critica: boolean, detalle: string) =>
    resultados.push({ nombre, ok, critica, detalle });

  if (aserciones.herramientasEsperadas !== undefined) {
    const faltantes = aserciones.herramientasEsperadas.filter(
      (esperada) =>
        !grabacion.llamadas.some(
          (llamada) =>
            llamada.nombre === esperada.nombre &&
            (esperada.argumentos === undefined || coincideParcial(llamada.argumentos, esperada.argumentos)),
        ),
    );
    agregar('herramientasEsperadas', faltantes.length === 0, false, faltantes.length === 0 ? 'herramientas esperadas llamadas' : `no se llamó: ${faltantes.map((f) => f.nombre).join(', ')}`);
  }
  if (aserciones.herramientasProhibidas !== undefined) {
    const llamadas = grabacion.llamadas.filter((l) => aserciones.herramientasProhibidas?.includes(l.nombre)).map((l) => l.nombre);
    agregar('herramientasProhibidas', llamadas.length === 0, true, llamadas.length === 0 ? 'ninguna herramienta prohibida' : `se llamó: ${[...new Set(llamadas)].join(', ')}`);
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
  if (aserciones.textoLiteral !== undefined) {
    const faltas = aserciones.textoLiteral.filter(({ herramienta, campo }) => {
      const valores = camposDeResultados(grabacion, herramienta, campo);
      return valores.length === 0 || !valores.every((valor) => grabacion.textoFinal.includes(valor));
    });
    agregar('textoLiteral', faltas.length === 0, false, faltas.length === 0 ? 'textos literales presentes' : `no aparece literal: ${faltas.map((f) => `${f.herramienta}.${f.campo}`).join(', ')}`);
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
  return resultados;
}
