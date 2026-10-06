import type { DefinicionMensajeFijo } from '../../compartido/mensajes-fijos/index.js';
import { CASOS_DEL_SISTEMA } from '../asistente/index.js';

/**
 * La lista cerrada de mensajes fijos (CFN1): los casos del sistema que dispara el código, menos `contra_entrega`, que es una
 * política que el LLM consulta. Se compone desde la lista única de `asistente` (D2 de la Fase 12): ningún texto de respaldo
 * se escribe aquí. Este módulo es un adaptador delgado hasta que T8 lo reemplace por la pantalla de casos.
 */
export const CATALOGO_REAL: readonly DefinicionMensajeFijo[] = CASOS_DEL_SISTEMA.filter(
  (caso) => caso.disparador === 'evento',
).map(({ clave, descripcion, textoRespaldo }) => ({ clave, descripcion, textoRespaldo }));
