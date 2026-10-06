import { readFile } from 'node:fs/promises';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AsistenteModule, SembrarCasos } from '../src/modulos/asistente/index.js';
import { ConfiguracionModule } from '../src/plataforma/config/index.js';
import { RelojModule } from '../src/plataforma/reloj/index.js';

export interface ResultadoSembrarCasosCli {
  readonly limpio: boolean;
  readonly mensaje: string;
}

/** Lo que el comando necesita del caso de uso, como doble en las pruebas y como el real en producción. */
export interface DependenciasSembrarCasos {
  readonly sembrar: Pick<SembrarCasos, 'ejecutar'>;
  /** Lee el archivo de casos de desarrollo (`--archivo`); por defecto, del disco. */
  readonly leerArchivo?: (ruta: string) => Promise<string>;
}

function rutaDelArchivo(argumentos: readonly string[]): { readonly ruta: string | null } | { readonly error: string } {
  if (argumentos.length === 0) return { ruta: null };
  const [bandera, ruta, ...demas] = argumentos;
  if (bandera !== '--archivo' || ruta === undefined || ruta === '' || demas.length > 0) {
    return { error: 'uso: npm run casos:sembrar [-- --archivo <ruta.json>]' };
  }
  return { ruta };
}

/** Ejecuta la semilla y arma el reporte: cuántos casos insertó y cuántos ya existían, nunca los textos (CAS6, R14). */
export async function ejecutarSembrarCasos(
  dependencias: DependenciasSembrarCasos,
  argumentos: readonly string[] = [],
): Promise<ResultadoSembrarCasosCli> {
  const destino = rutaDelArchivo(argumentos);
  if ('error' in destino) return { limpio: false, mensaje: `casos:sembrar: ${destino.error}` };
  let contenido: unknown;
  if (destino.ruta !== null) {
    try {
      contenido = JSON.parse(await (dependencias.leerArchivo ?? ((ruta) => readFile(ruta, 'utf8')))(destino.ruta));
    } catch {
      return { limpio: false, mensaje: `casos:sembrar: no se pudo leer «${destino.ruta}» como JSON` };
    }
  }
  try {
    const { insertados, existentes } = await dependencias.sembrar.ejecutar(contenido);
    return { limpio: true, mensaje: `casos:sembrar: ${String(insertados)} insertados, ${String(existentes)} ya existían.` };
  } catch (error) {
    return { limpio: false, mensaje: `casos:sembrar: no se pudo sembrar: ${(error as Error).message}` };
  }
}

/** Contexto mínimo del comando: configuración, reloj y `asistente`, sin HTTP, el LLM ni las colas. */
@Module({ imports: [ConfiguracionModule, RelojModule, AsistenteModule] })
class ContextoSembrarCasos {}

/**
 * Comando `npm run casos:sembrar` (CAS6): crea las categorías «Sistema» y «Políticas», los once casos del sistema y un caso
 * por cada política de `parametro`, retirando de `parametro` lo que copió. Con `--archivo <ruta.json>` suma los casos de
 * desarrollo de ese archivo. Idempotente; nunca pisa un caso existente.
 */
export async function sembrarCasos(argumentos: readonly string[] = []): Promise<ResultadoSembrarCasosCli> {
  try {
    const contexto = await NestFactory.createApplicationContext(ContextoSembrarCasos, { logger: false });
    try {
      return await ejecutarSembrarCasos({ sembrar: contexto.get(SembrarCasos) }, argumentos);
    } finally {
      await contexto.close();
    }
  } catch (error) {
    return { limpio: false, mensaje: `casos:sembrar: no se pudo sembrar: ${(error as Error).message}` };
  }
}
