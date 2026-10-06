import { z } from 'zod';

/**
 * Esquemas de la API de configuración (CFG1): cubren la **forma** (tipos); el rango de cada valor lo decide el dominio y
 * responde `422 configuracion-invalida` con el motivo de cada campo. Los cuerpos de escritura admiten campos de más
 * (`looseObject`) solo para rechazarlos con ese mismo `422` y nombrarlos (CFG4: el estado del techo no se escribe).
 */

const rango = z.object({ desde: z.string().max(10), hasta: z.string().max(10) }).nullable();
const dias = z.object({ lun: rango, mar: rango, mie: rango, jue: rango, vie: rango, sab: rango, dom: rango });

export const esquemaExcepcion = z.object({ fecha: z.string(), motivo: z.string().nullable() });

export const esquemaHorario = z.object({
  dias,
  excepciones: z.array(esquemaExcepcion),
  actualizado: z.string().nullable(),
});
export type HorarioRespuesta = z.infer<typeof esquemaHorario>;

export const esquemaGuardarHorario = z.looseObject({ dias });
export type GuardarHorarioCuerpo = z.infer<typeof esquemaGuardarHorario>;

export const esquemaCrearExcepcion = z.object({ fecha: z.string().max(10), motivo: z.string().max(1000).nullable().optional() });
export type CrearExcepcionCuerpo = z.infer<typeof esquemaCrearExcepcion>;

export const esquemaFechaExcepcion = z.string().max(10);

export const esquemaEnvios = z.object({
  recargoContraentregaPct: z.number(),
  factorVolumetrico: z.number(),
  actualizado: z.string().nullable(),
});
export type EnviosRespuesta = z.infer<typeof esquemaEnvios>;

export const esquemaGuardarEnvios = z.looseObject({ recargoContraentregaPct: z.number(), factorVolumetrico: z.number() });
export type GuardarEnviosCuerpo = z.infer<typeof esquemaGuardarEnvios>;

export const esquemaGastoLlm = z.object({
  techoMensualUsd: z.number().nullable(),
  estado: z.object({ mes: z.string(), avisoEmitido: z.boolean(), bloqueado: z.boolean() }).nullable(),
  gastoMesUsd: z.number().nullable(),
  actualizado: z.string().nullable(),
});
export type GastoLlmRespuesta = z.infer<typeof esquemaGastoLlm>;

export const esquemaGuardarGastoLlm = z.looseObject({ techoMensualUsd: z.number() });
export type GuardarGastoLlmCuerpo = z.infer<typeof esquemaGuardarGastoLlm>;
