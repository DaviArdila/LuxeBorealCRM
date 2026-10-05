/**
 * Claves de idempotencia por efecto de negocio (D11, B5). Las construye el dominio de `canales`,
 * no el adaptador: identifican el efecto (qué respuesta, qué paso), no el formato de Chatwoot —
 * por eso el prefijo es `canal:`, no `chatwoot:` (ADR-0005: cambiar de adaptador no cambia las
 * claves). Este archivo no importa nada (regla `dominio-aislado`).
 */

/** Máximo de pasos por secuencia de mensajes (D11); `paso` MUST estar en 0..MAX_PASOS_SECUENCIA-1. */
export const MAX_PASOS_SECUENCIA = 20;

/** Sin ":" para que la clave nunca sea ambigua al partirla por ese separador (D11). */
const PATRON_ID = /^[A-Za-z0-9_-]{1,64}$/;

function validarId(valor: string, nombre: string): void {
  if (!PATRON_ID.test(valor)) {
    throw new Error(`${nombre} inválido: "${valor}" (debe cumplir ^[A-Za-z0-9_-]{1,64}$, sin ':').`);
  }
}

/** Grupo del outbox de una conversación (D10): sus filas se publican en orden estricto entre sí. */
export function grupoConversacion(idConversacion: string): string {
  validarId(idConversacion, 'idConversacion');
  return `canal:${idConversacion}`;
}

/**
 * Clave de idempotencia de un paso de una secuencia de mensajes (D11, B5). `paso` es la posición
 * 0-indexada dentro de la secuencia (0..{@link MAX_PASOS_SECUENCIA} - 1); se serializa con dos
 * dígitos (`00`-`19`) para que la clave ordene igual como texto que como número.
 */
export function claveMensaje(idConversacion: string, idRespuesta: string, paso: number): string {
  validarId(idConversacion, 'idConversacion');
  validarId(idRespuesta, 'idRespuesta');
  if (!Number.isInteger(paso) || paso < 0 || paso >= MAX_PASOS_SECUENCIA) {
    throw new Error(`paso inválido: ${paso} (debe ser un entero entre 0 y ${MAX_PASOS_SECUENCIA - 1}).`);
  }
  return `canal:mensaje:${idConversacion}:${idRespuesta}:${String(paso).padStart(2, '0')}`;
}

/** Clave de idempotencia de un cambio de estado de conversación (D11). */
export function claveEstado(idConversacion: string, idOperacion: string): string {
  validarId(idConversacion, 'idConversacion');
  validarId(idOperacion, 'idOperacion');
  return `canal:estado:${idConversacion}:${idOperacion}`;
}

/** Clave de idempotencia de un efecto de "agregar etiquetas" (D11). */
export function claveEtiquetas(idConversacion: string, idOperacion: string): string {
  validarId(idConversacion, 'idConversacion');
  validarId(idOperacion, 'idOperacion');
  return `canal:etiquetas:${idConversacion}:${idOperacion}`;
}
