import type { DefinicionMensajeFijo } from '../../../compartido/mensajes-fijos/index.js';

/**
 * Texto fijo de `catalogo` (CFN1) y su descripción para el admin. Evita que `CotizarEnvio` se quede sin texto que citar
 * al cliente antes de que el negocio configure el suyo; R15 permite sobrescribirlo desde `parametro` sin desplegar.
 */
export const TEXTOS_FIJOS_CATALOGO = [
  {
    clave: 'mensaje_fuera_cobertura',
    descripcion: 'Cuando el cliente pide envío a una ciudad sin cobertura: el bot cita este texto tal cual y le ofrece otra dirección.',
    textoRespaldo: 'Por ahora no tenemos cobertura de envío a tu ciudad. Si quieres, indícame otra dirección de entrega.',
  },
] as const satisfies readonly DefinicionMensajeFijo[];

export const MENSAJE_FUERA_COBERTURA_POR_DEFECTO = TEXTOS_FIJOS_CATALOGO[0].textoRespaldo;
