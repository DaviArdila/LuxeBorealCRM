import type { DefinicionMensajeFijo } from '../../../compartido/mensajes-fijos/index.js';

/**
 * Texto fijo de `conversaciones` (CFN1) y su descripción para el admin. Sin texto real de negocio todavía: el negocio lo
 * carga o lo cambia en `parametro` sin desplegar (R15), mismo hallazgo abierto que los demás parámetros.
 */
export const TEXTOS_FIJOS_CONVERSACIONES = [
  {
    clave: 'mensaje_espera_handoff',
    descripcion:
      'Aviso único cuando el cliente vuelve a escribir mientras espera que un asesor lo atienda: lo tranquiliza y le dice que ya viene alguien.',
    textoRespaldo: 'Seguimos aquí. Un asesor te va a atender en breve, gracias por tu paciencia.',
  },
] as const satisfies readonly DefinicionMensajeFijo[];

export const MENSAJE_ESPERA_HANDOFF_POR_DEFECTO = TEXTOS_FIJOS_CONVERSACIONES[0].textoRespaldo;
