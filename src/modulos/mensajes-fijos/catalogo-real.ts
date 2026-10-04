import type { DefinicionMensajeFijo } from '../../compartido/mensajes-fijos/index.js';
import { TEXTOS_FIJOS_AGENTE } from '../agente/index.js';
import { TEXTOS_FIJOS_CATALOGO } from '../catalogo/index.js';
import { TEXTOS_FIJOS_CONVERSACIONES } from '../conversaciones/index.js';
import { TEXTOS_FIJOS_LLM } from '../llm/index.js';

/**
 * La lista cerrada de mensajes fijos de esta fase (CFN1), compuesta desde el catálogo que exporta cada módulo dueño:
 * ningún texto de respaldo se escribe aquí (D2, AGT3). Agregar un mensaje es agregarlo al catálogo de su dueño y
 * listarlo en esta composición.
 */
export const CATALOGO_REAL: readonly DefinicionMensajeFijo[] = [
  ...TEXTOS_FIJOS_AGENTE,
  ...TEXTOS_FIJOS_CONVERSACIONES,
  ...TEXTOS_FIJOS_CATALOGO,
  ...TEXTOS_FIJOS_LLM,
];
