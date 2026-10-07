import { z } from 'zod';
import { MAX_CARACTERES_ESTILO } from '../dominio/validar-estilo.js';

/**
 * `PUT /api/v1/agente/estilo` (AGT23): el esquema solo cubre la forma (texto entre 1 y 4000 caracteres, el mismo tope
 * de AGT20); las reglas de negocio (pesos, SKU, plantillas) las decide `validarEstilo` y responden `422`.
 */
export const esquemaPublicarEstilo = z.object({ texto: z.string().min(1).max(MAX_CARACTERES_ESTILO) });
export type PublicarEstiloCuerpo = z.infer<typeof esquemaPublicarEstilo>;

export const esquemaRestaurarEstilo = z.object({ version: z.int().min(1) });
export type RestaurarEstiloCuerpo = z.infer<typeof esquemaRestaurarEstilo>;

/** Quien publicó una versión (EST-D3); la respuesta lleva `null` si fue el comando `prompt:estilo` o rige el archivo. */
export const esquemaAutorEstilo = z.object({ id: z.uuid(), nombre: z.string() });

/** `version` es `null` cuando rige el archivo de respaldo (AGT18). */
export const esquemaEstiloVigente = z.object({
  version: z.int().nullable(),
  origen: z.enum(['base', 'archivo']),
  texto: z.string(),
  publicadoPor: esquemaAutorEstilo.nullable(),
});
export type EstiloVigenteRespuesta = z.infer<typeof esquemaEstiloVigente>;

/** Las versiones retiradas, la más reciente primero; `fecha` es cuándo dejó de estar vigente (AGT21). */
export const esquemaHistorialEstilo = z.object({
  versiones: z.array(
    z.object({ version: z.int(), fecha: z.string(), texto: z.string(), publicadoPor: esquemaAutorEstilo.nullable() }),
  ),
});
export type HistorialEstiloRespuesta = z.infer<typeof esquemaHistorialEstilo>;

export const esquemaVersionEstilo = z.object({ version: z.int() });
export type VersionEstiloRespuesta = z.infer<typeof esquemaVersionEstilo>;

// --- Secciones del estilo (EST-API) ------------------------------------------------------------------------------------

const id = z.uuid();

export const esquemaSeccionEstilo = z.object({
  id,
  titulo: z.string(),
  texto: z.string(),
  orden: z.int(),
  activo: z.boolean(),
  /** La fecha que el cliente devuelve al editar: si cambió, la edición se rechaza con `seccion-modificada`. */
  actualizado: z.string(),
});
export type SeccionEstiloRespuesta = z.infer<typeof esquemaSeccionEstilo>;

/** Las secciones por `orden` y cuánto ocupa el estilo compuesto (las activas) frente al tope, para mostrarlo al editar. */
export const esquemaListaSeccionesEstilo = z.object({
  secciones: z.array(esquemaSeccionEstilo),
  caracteresCompuestos: z.int(),
  maximo: z.int(),
});
export type ListaSeccionesEstiloRespuesta = z.infer<typeof esquemaListaSeccionesEstilo>;

/** Solo la forma, con topes absurdos; las reglas (título, contenido, tope del compuesto) responden `422`. */
export const esquemaCrearSeccionEstilo = z.object({
  titulo: z.string().max(1000),
  texto: z.string().max(MAX_CARACTERES_ESTILO * 2),
  activo: z.boolean().optional(),
});
export type CrearSeccionEstiloCuerpo = z.infer<typeof esquemaCrearSeccionEstilo>;

export const esquemaEditarSeccionEstilo = z.object({
  /** La `actualizado` que el cliente leyó. */
  actualizado: z.iso.datetime(),
  titulo: z.string().max(1000).optional(),
  texto: z.string().max(MAX_CARACTERES_ESTILO * 2).optional(),
  activo: z.boolean().optional(),
});
export type EditarSeccionEstiloCuerpo = z.infer<typeof esquemaEditarSeccionEstilo>;

export const esquemaIdSeccionEstilo = id;

export const esquemaOrdenSeccionesEstilo = z.object({ ids: z.array(id).max(500) });
export type OrdenSeccionesEstiloCuerpo = z.infer<typeof esquemaOrdenSeccionesEstilo>;
