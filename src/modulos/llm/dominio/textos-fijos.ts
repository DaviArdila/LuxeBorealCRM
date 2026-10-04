import type { DefinicionMensajeFijo } from '../../../compartido/mensajes-fijos/index.js';

/**
 * Texto fijo de `llm` (CFN1, P22) y su descripción para el admin: neutro, no revela el límite de gasto y no promete una
 * hora de respuesta. El negocio lo reemplaza en `parametro` sin desplegar (R15).
 */
export const TEXTOS_FIJOS_LLM = [
  {
    clave: 'mensaje_techo_gasto',
    descripcion:
      'Cuando se alcanza el techo mensual de gasto del modelo: el cliente lo ve y la conversación pasa a un asesor. No debe revelar el límite ni prometer una hora.',
    textoRespaldo: 'Gracias por escribirnos. En este momento te atiende directamente un asesor, que te responderá en breve.',
  },
] as const satisfies readonly DefinicionMensajeFijo[];

export const MENSAJE_TECHO_GASTO_POR_DEFECTO = TEXTOS_FIJOS_LLM[0].textoRespaldo;
