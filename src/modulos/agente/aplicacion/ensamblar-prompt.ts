import { Injectable } from '@nestjs/common';

/** Instrucciones variables del turno (contexto inicial, horario): siempre al final del prompt (AGT13). */
export interface EntradaPrompt {
  readonly instruccionesTurno: readonly string[];
}

const REGLAS_PROVISIONALES =
  'Eres el asistente de ventas de Luxe Boreal por WhatsApp. Responde corto y en español. ' +
  'Todo dato de un producto, precio o envío MUST salir de una herramienta; nunca lo inventes.';

/**
 * Arma el prompt de sistema. En esta tarea (T2) es un texto provisional; T8 de la Fase 07b lo
 * reemplaza por los archivos versionados de `prompts/` con prefijo estable (D8, AGT13).
 */
@Injectable()
export class EnsamblarPrompt {
  ensamblar(entrada: EntradaPrompt = { instruccionesTurno: [] }): string {
    return [REGLAS_PROVISIONALES, ...entrada.instruccionesTurno].join('\n\n');
  }
}
