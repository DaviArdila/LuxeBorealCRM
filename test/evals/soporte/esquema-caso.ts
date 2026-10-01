import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

/** Aserciones deterministas disponibles para un turno (D4 de la Fase 07c). */
export const NOMBRES_ASERCION = [
  'herramientasEsperadas',
  'herramientasProhibidas',
  'dineroConRastro',
  'recargoSinPorcentaje',
  'handoff',
  'textoLiteral',
  'textoAusente',
  'menciona',
  'sinEmojis',
  'sinSku',
] as const;
export type NombreAsercion = (typeof NOMBRES_ASERCION)[number];

const pasoGuion = z.union([
  z.object({ texto: z.string().min(1) }).strict(),
  z
    .object({
      llamadas: z.array(z.object({ nombre: z.string().min(1), argumentos: z.record(z.string(), z.unknown()) }).strict()).min(1),
    })
    .strict(),
  z
    .object({
      llamadasInvalidas: z
        .array(
          z
            .object({ nombre: z.string().min(1), argumentos: z.record(z.string(), z.unknown()), causa: z.string().min(1) })
            .strict(),
        )
        .min(1),
    })
    .strict(),
  z.object({ error: z.enum(['timeout', 'no-reintentable', 'circuito-abierto', 'techo-alcanzado', 'proveedor-caido']) }).strict(),
]);
export type PasoGuion = z.infer<typeof pasoGuion>;

const aserciones = z
  .object({
    herramientasEsperadas: z
      .array(z.object({ nombre: z.string().min(1), argumentos: z.record(z.string(), z.unknown()).optional() }).strict())
      .optional(),
    herramientasProhibidas: z.array(z.string().min(1)).optional(),
    dineroConRastro: z.boolean().optional(),
    recargoSinPorcentaje: z.boolean().optional(),
    handoff: z.enum(['esperado', 'prohibido']).optional(),
    textoLiteral: z.array(z.object({ herramienta: z.string().min(1), campo: z.string().min(1) }).strict()).optional(),
    textoAusente: z.array(z.string().min(1)).optional(),
    menciona: z.array(z.string().min(1)).optional(),
    sinEmojis: z.boolean().optional(),
    sinSku: z.boolean().optional(),
  })
  .strict();
export type AsercionesTurno = z.infer<typeof aserciones>;

const turno = z
  .object({
    mensajes: z
      .array(
        z
          .object({
            tipoContenido: z.enum(['texto', 'imagen', 'audio', 'ubicacion', 'documento', 'sticker', 'otro']),
            texto: z.string(),
          })
          .strict(),
      )
      .min(1),
    guion: z.array(pasoGuion).optional(),
    aserciones,
  })
  .strict();
export type TurnoCaso = z.infer<typeof turno>;

const caso = z
  .object({
    id: z.string().min(1),
    titulo: z.string().min(1),
    origen: z.enum(['sintetico', 'real-anonimizado']),
    revisadoPor: z.string().min(1).optional(),
    fecha: z.string().min(1).optional(),
    semilla: z.object({ politicas: z.record(z.string(), z.string().nullable()).optional() }).strict().optional(),
    contacto: z.object({ nombre: z.string().min(1).optional() }).strict().optional(),
    turnos: z.array(turno).min(1),
    esperaFallo: z.enum(NOMBRES_ASERCION).optional(),
  })
  .strict()
  .superRefine((valor, ctx) => {
    if (valor.origen === 'sintetico') {
      valor.turnos.forEach((t, i) => {
        if (t.guion === undefined) {
          ctx.addIssue({ code: 'custom', path: ['turnos', i, 'guion'], message: 'un caso sintético MUST traer guion' });
        }
      });
    } else {
      for (const campo of ['revisadoPor', 'fecha'] as const) {
        if (valor[campo] === undefined) {
          ctx.addIssue({ code: 'custom', path: [campo], message: `un caso real-anonimizado MUST traer ${campo}` });
        }
      }
    }
  });
export type CasoEval = z.infer<typeof caso>;

/** Valida un caso ya parseado; el error nombra el archivo y el campo (D3). */
export function parsearCaso(dato: unknown, archivo: string): CasoEval {
  const resultado = caso.safeParse(dato);
  if (resultado.success) {
    return resultado.data;
  }
  const detalle = resultado.error.issues
    .map((issue) => `${issue.path.map(String).join('.') || 'caso'}: ${issue.message}`)
    .join('; ');
  throw new Error(`Caso de evals inválido en ${archivo}: ${detalle}`);
}

/** Lee todos los `.json` de una carpeta (no recursivo), ordenados por `id`. */
export function cargarCasos(carpeta: string): readonly CasoEval[] {
  return readdirSync(carpeta)
    .filter((archivo) => archivo.endsWith('.json'))
    .map((archivo) => {
      let dato: unknown;
      try {
        dato = JSON.parse(readFileSync(path.join(carpeta, archivo), 'utf8'));
      } catch {
        throw new Error(`Caso de evals ilegible en ${archivo}: no es JSON válido`);
      }
      return parsearCaso(dato, archivo);
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}
