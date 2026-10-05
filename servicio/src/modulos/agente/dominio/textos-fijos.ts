import type { DefinicionMensajeFijo } from '../../../compartido/mensajes-fijos/index.js';

/**
 * Único lugar con los textos fijos del agente (AGT3, P31) y su descripción para el admin (CFN1): los del prototipo
 * (`ChatLuxeCRM/prisma/seedCatalogo.ts` y `docs/plantilla-catalogo/parametros.csv`), sin el nombre de la asesora, que es
 * dato del negocio. El negocio los reemplaza en `parametro` sin desplegar (R15) y el respaldo rige si no hay valor.
 */
export const TEXTOS_FIJOS_AGENTE = [
  {
    clave: 'mensaje_pedir_texto_audio',
    descripcion: 'Cuando el cliente manda un audio: el bot le pide que escriba su mensaje, porque todavía no escucha audios.',
    textoRespaldo: 'Por acá no puedo escuchar audios todavía, ¿me lo escribes en texto porfa?',
  },
  {
    clave: 'mensaje_imagen_no_procesada',
    descripcion: 'Cuando el cliente manda una imagen sin texto: el bot le pide que cuente qué producto busca o que dé el SKU.',
    textoRespaldo: 'No puedo ver la imagen todavía — ¿me cuentas en texto qué producto buscas, o me das el SKU?',
  },
  {
    clave: 'aviso_datos',
    descripcion:
      'Aviso de asistente automatizado y del uso de sus datos, que el cliente ve al inicio de cada conversación. Es el aviso que exige la política de privacidad (R14): no lo dejes vacío ni le quites que habla con un asistente automatizado.',
    textoRespaldo: 'Soy un asistente automatizado. Tus datos se usan solo para gestionar tu pedido.',
  },
  {
    clave: 'mensaje_handoff',
    descripcion: 'Cuando el bot pasa la conversación a un asesor dentro del horario de atención.',
    textoRespaldo: 'Te paso con un asesor para cerrar los detalles — te escribe en un momento.',
  },
  {
    clave: 'mensaje_handoff_fuera_horario',
    descripcion: 'Cuando el bot pasa la conversación a un asesor fuera del horario de atención.',
    textoRespaldo: 'En este momento no hay un asesor disponible; apenas abramos te escribimos para cerrar los detalles.',
  },
  {
    // P31: el texto del prototipo, que ya está en uso real.
    clave: 'mensaje_error_llm',
    descripcion: 'Cuando el bot no puede responder por una falla técnica del modelo: el cliente lo ve y la conversación pasa a un asesor.',
    textoRespaldo: 'Ya te respondemos en un momento.',
  },
  {
    // P34: texto de cierre de la captura fuera de horario.
    clave: 'mensaje_captura_completa',
    descripcion: 'Cuando el cliente termina de dar sus datos fuera de horario: cierra la captura y le avisa que un asesor lo contactará al abrir.',
    textoRespaldo: 'Listo, ya tengo tus datos. Un asesor te contactará apenas abramos para cerrar los detalles.',
  },
] as const satisfies readonly DefinicionMensajeFijo[];

/** Claves de `parametro` con los textos fijos que el agente envía sin pasar por el LLM (AGT3, R15). */
export type ClaveTextoAgente = (typeof TEXTOS_FIJOS_AGENTE)[number]['clave'];

/** Texto de respaldo por clave, derivado del catálogo para que no haya una segunda lista que se desalinee. */
export const TEXTOS_DE_RESPALDO_AGENTE: Readonly<Record<ClaveTextoAgente, string>> = Object.fromEntries(
  TEXTOS_FIJOS_AGENTE.map(({ clave, textoRespaldo }) => [clave, textoRespaldo]),
) as Record<ClaveTextoAgente, string>;
