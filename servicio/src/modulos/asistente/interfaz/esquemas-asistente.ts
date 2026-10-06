import { z } from 'zod';

/**
 * Esquemas de la API de administración del asistente (CAS9): cubren solo la **forma** (tipos y topes absurdos con `400`); las
 * reglas de negocio (largos, pesos, SKU, plantillas, duplicados) las deciden los casos de uso y responden `409` o `422`.
 */

const id = z.uuid();

// --- Categorías -------------------------------------------------------------------------------------------------------

export const esquemaCategoriaCaso = z.object({
  id,
  nombre: z.string(),
  orden: z.int(),
  totalCasos: z.int(),
});
export type CategoriaCasoRespuesta = z.infer<typeof esquemaCategoriaCaso>;

export const esquemaListaCategoriasCaso = z.object({ categorias: z.array(esquemaCategoriaCaso) });
export type ListaCategoriasCasoRespuesta = z.infer<typeof esquemaListaCategoriasCaso>;

export const esquemaNombreCategoria = z.object({ nombre: z.string().max(500) });
export type NombreCategoriaCuerpo = z.infer<typeof esquemaNombreCategoria>;

export const esquemaOrdenCategorias = z.object({ ids: z.array(id).max(500) });
export type OrdenCategoriasCuerpo = z.infer<typeof esquemaOrdenCategorias>;

// --- Casos ------------------------------------------------------------------------------------------------------------

const modo = z.enum(['literal', 'guia']);

export const esquemaCasoAsistente = z.object({
  id,
  categoriaId: id,
  categoriaNombre: z.string(),
  titulo: z.string(),
  cuandoAplica: z.string(),
  texto: z.string(),
  modo,
  disparador: z.enum(['evento', 'intencion']),
  claveSistema: z.string().nullable(),
  activo: z.boolean(),
  creado: z.string(),
  /** La fecha que el cliente devuelve al editar: si cambió, la edición se rechaza con `caso-modificado` (CAS3). */
  actualizado: z.string(),
});
export type CasoAsistenteRespuesta = z.infer<typeof esquemaCasoAsistente>;

export const esquemaPaginaCasos = z.object({ items: z.array(esquemaCasoAsistente), siguienteCursor: z.string().nullable() });
export type PaginaCasosRespuesta = z.infer<typeof esquemaPaginaCasos>;

/** `claveSistema` se acepta solo para rechazarla con `422` (CAS4): la API nunca crea un caso del sistema. */
export const esquemaCrearCaso = z.object({
  categoriaId: id,
  titulo: z.string().max(1000),
  cuandoAplica: z.string().max(5000).optional(),
  texto: z.string().max(10_000),
  modo: modo.optional(),
  activo: z.boolean().optional(),
  claveSistema: z.string().max(200).nullable().optional(),
});
export type CrearCasoCuerpo = z.infer<typeof esquemaCrearCaso>;

export const esquemaEditarCaso = z.object({
  /** La `actualizado` que el cliente leyó (CAS3). */
  actualizado: z.iso.datetime(),
  categoriaId: id.optional(),
  titulo: z.string().max(1000).optional(),
  cuandoAplica: z.string().max(5000).optional(),
  texto: z.string().max(10_000).optional(),
  modo: modo.optional(),
  activo: z.boolean().optional(),
  claveSistema: z.string().max(200).nullable().optional(),
});
export type EditarCasoCuerpo = z.infer<typeof esquemaEditarCaso>;

export const esquemaConsultaCasos = z.object({
  q: z.string().max(200).optional(),
  categoriaId: id.optional(),
  disparador: z.enum(['evento', 'intencion']).optional(),
  activo: z
    .enum(['true', 'false'])
    .transform((valor) => valor === 'true')
    .optional(),
  cursor: z.string().max(1000).optional(),
  limite: z.coerce.number().int().min(1).max(100).optional(),
});
export type ConsultaCasosQuery = z.infer<typeof esquemaConsultaCasos>;

export const esquemaIdCaso = id;
