import { CATALOGO_CODIGOS, type CodigoError } from './catalogo-codigos.js';

const PREFIJO_URN = 'urn:luxeboreal:error:';

/**
 * Detalle de un campo con problema (D5). Mismo vocabulario que `ProblemaConfiguracion` de
 * `plataforma/config` (PLT1): `falta` | `formato` | `valor`. MUST NOT incluir el valor recibido —
 * misma prohibición que `ConfiguracionInvalidaError`, por el mismo motivo (R14).
 */
export interface DetalleCampo {
  readonly campo: string;
  readonly problema: 'falta' | 'formato' | 'valor';
}

/** Cuerpo RFC 9457 (D5): `codigo` es el contrato estable; `status` no lo es (API4). */
export interface Problema {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly codigo: CodigoError;
  readonly instance?: string;
  /** Motivo legible por una persona (RFC 9457); solo en los errores que lo traen, sin valores recibidos (R14). */
  readonly detail?: string;
  readonly errores?: readonly DetalleCampo[];
}

/**
 * Pura: del código de {@link CATALOGO_CODIGOS} y el contexto de la petición al cuerpo RFC 9457
 * (D5). Nunca recibe ni propaga el valor de ningún campo — solo su nombre y su tipo de problema;
 * quien llama (el filtro global o quien lanza un `ErrorDeAplicacion`) es responsable de no pasar
 * un valor recibido dentro de `contexto.errores`.
 */
export function construirProblema(
  codigo: CodigoError,
  contexto: { readonly instance?: string; readonly errores?: readonly DetalleCampo[]; readonly detalle?: string } = {},
): Problema {
  const { status, title } = CATALOGO_CODIGOS[codigo];
  return {
    type: `${PREFIJO_URN}${codigo}`,
    title,
    status,
    codigo,
    ...(contexto.instance === undefined ? {} : { instance: contexto.instance }),
    ...(contexto.detalle === undefined ? {} : { detail: contexto.detalle }),
    ...(contexto.errores === undefined ? {} : { errores: contexto.errores }),
  };
}
