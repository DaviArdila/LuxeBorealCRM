import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { casoDesdeChatwoot, ErrorDatoPersonalResidual, type RespuestaMensajesChatwoot } from './anonimizador.js';

export interface ArgumentosAnonimizar {
  readonly entrada: string;
  readonly salida: string;
  readonly nombres: readonly string[];
  readonly id: string | undefined;
}

export interface ResultadoAnonimizar {
  readonly limpio: boolean;
  readonly mensaje: string;
}

function valorDe(argumentos: readonly string[], bandera: string): string | undefined {
  const indice = argumentos.indexOf(bandera);
  return indice === -1 ? undefined : argumentos[indice + 1];
}

/** `--entrada` y `--salida` son obligatorios; `--nombres` es una lista separada por comas; `--id` es opcional. */
export function parsearArgumentos(argumentos: readonly string[]): ArgumentosAnonimizar {
  const entrada = valorDe(argumentos, '--entrada');
  const salida = valorDe(argumentos, '--salida');
  if (entrada === undefined) throw new Error('Falta --entrada <archivo.json> (respuesta de GET .../messages de Chatwoot).');
  if (salida === undefined) throw new Error('Falta --salida <archivo.json> (por ejemplo test/evals/casos/dorado/<id>.json).');
  const nombres = (valorDe(argumentos, '--nombres') ?? '')
    .split(',')
    .map((nombre) => nombre.trim())
    .filter((nombre) => nombre.length > 0);
  return { entrada, salida, nombres, id: valorDe(argumentos, '--id') };
}

/**
 * Comando `npm run evals:anonimizar` (D8, EVL5): lee una conversación cruda de Chatwoot, la anonimiza
 * y escribe el caso **solo** si la verificación final pasa y el destino no existe (podría estar ya
 * revisado). El caso sale con `revisadoPor` y `fecha` vacíos: no carga hasta que una persona lo revise.
 * Los mensajes de error nunca copian datos de la conversación (R14).
 */
export function anonimizarConversacion(argumentos: readonly string[]): Promise<ResultadoAnonimizar> {
  let parseados: ArgumentosAnonimizar;
  try {
    parseados = parsearArgumentos(argumentos);
  } catch (error) {
    return Promise.resolve({ limpio: false, mensaje: `anonimizar: ${(error as Error).message}` });
  }

  let crudo: RespuestaMensajesChatwoot;
  try {
    crudo = JSON.parse(readFileSync(parseados.entrada, 'utf8')) as RespuestaMensajesChatwoot;
  } catch {
    return Promise.resolve({ limpio: false, mensaje: `anonimizar: no se pudo leer ${parseados.entrada} como JSON.` });
  }

  if (existsSync(parseados.salida)) {
    return Promise.resolve({ limpio: false, mensaje: `anonimizar: ${parseados.salida} ya existe; no se sobrescribe.` });
  }

  try {
    const id = parseados.id ?? path.basename(parseados.salida, '.json');
    const caso = casoDesdeChatwoot(crudo, { id, nombres: parseados.nombres });
    writeFileSync(parseados.salida, `${JSON.stringify(caso, null, 2)}\n`, 'utf8');
    return Promise.resolve({
      limpio: true,
      mensaje:
        `anonimizar: ${String(caso.turnos.length)} turno(s) escritos en ${parseados.salida}. ` +
        'Revísalo a mano, agrega las aserciones y completa revisadoPor y fecha antes de commitear.',
    });
  } catch (error) {
    if (error instanceof ErrorDatoPersonalResidual) {
      return Promise.resolve({ limpio: false, mensaje: `anonimizar: ${error.message}` });
    }
    return Promise.resolve({ limpio: false, mensaje: 'anonimizar: error inesperado al anonimizar la conversación.' });
  }
}
