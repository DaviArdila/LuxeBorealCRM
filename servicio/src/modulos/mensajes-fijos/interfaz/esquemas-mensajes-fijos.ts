import { z } from 'zod';

/**
 * `PUT /api/v1/mensajes-fijos/{clave}` (CFN2): el esquema solo cubre la forma. El tope de 4.000 caracteres evita cuerpos
 * absurdos con `400`; el de 1.000 caracteres, el texto en blanco, los pesos y las plantillas los decide
 * `validarMensajeFijo` y responden `422` con su motivo.
 */
export const esquemaGuardarMensajeFijo = z.object({ texto: z.string().max(4000) });
export type GuardarMensajeFijoCuerpo = z.infer<typeof esquemaGuardarMensajeFijo>;

/** Un mensaje fijo (CFN1): `actualizado` es ISO 8601 y solo existe con origen `base`. */
export const esquemaMensajeFijo = z.object({
  clave: z.string(),
  descripcion: z.string(),
  texto: z.string(),
  origen: z.enum(['base', 'respaldo']),
  actualizado: z.string().nullable(),
});

export const esquemaListaMensajesFijos = z.object({ mensajes: z.array(esquemaMensajeFijo) });
export type ListaMensajesFijosRespuesta = z.infer<typeof esquemaListaMensajesFijos>;
