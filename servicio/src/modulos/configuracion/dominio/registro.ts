import { DIAS, esFactorValido, esRecargoValido, esTechoValido } from './configuracion.js';

/**
 * Registro tipado de `parametro` (CFG6): las únicas claves que la tabla guarda y el tipo que valida cada una. Ningún texto
 * al cliente (eso es `asistente`) ni el estilo del bot (eso es `estilo-agente`) viven aquí.
 */
function esHorario(valor: unknown): boolean {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor) && DIAS.every((dia) => dia in valor);
}

function esEstadoDelTecho(valor: unknown): boolean {
  if (typeof valor !== 'object' || valor === null) return false;
  const c = valor as Record<string, unknown>;
  return typeof c['mes'] === 'string' && typeof c['gastoUsd'] === 'number' && typeof c['techoUsd'] === 'number' && typeof c['avisoEmitido'] === 'boolean' && typeof c['bloqueado'] === 'boolean';
}

const REGISTRO = {
  horario_atencion: esHorario,
  recargo_contraentrega_pct: esRecargoValido,
  factor_volumetrico: esFactorValido,
  llm_techo_mensual_usd: esTechoValido,
  llm_estado_techo: esEstadoDelTecho,
} as const satisfies Record<string, (valor: unknown) => boolean>;

export type ClaveRegistrada = keyof typeof REGISTRO;

export const CLAVES_REGISTRADAS = Object.keys(REGISTRO) as readonly ClaveRegistrada[];

export function esClaveRegistrada(clave: string): clave is ClaveRegistrada {
  return Object.hasOwn(REGISTRO, clave);
}

/** `true` si el valor tiene el tipo que la clave exige. */
export function validarValorRegistrado(clave: ClaveRegistrada, valor: unknown): boolean {
  return REGISTRO[clave](valor);
}
