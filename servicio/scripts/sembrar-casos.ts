import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { EstiloModule, SembrarEstilo } from '../src/modulos/agente/index.js';
import { AsistenteModule, SembrarCasos } from '../src/modulos/asistente/index.js';
import { ConfiguracionModule } from '../src/plataforma/config/index.js';
import { RelojModule } from '../src/plataforma/reloj/index.js';
import { resolverRaizServicio } from './herramientas.js';

export interface ResultadoSembrarCasosCli {
  readonly limpio: boolean;
  readonly mensaje: string;
}

/** Lo que el comando necesita del caso de uso, como doble en las pruebas y como el real en producción. */
export interface DependenciasSembrarCasos {
  readonly sembrar: Pick<SembrarCasos, 'ejecutar'>;
  /** Siembra el estilo inicial solo si la base no tiene ninguna versión (EST-D6). */
  readonly sembrarEstilo: Pick<SembrarEstilo, 'ejecutar'>;
  /** Lee el texto del estilo inicial (`prisma/datos/estilo-inicial.md`); en las pruebas, un doble. */
  readonly leerEstiloInicial: () => Promise<string>;
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

/** Ruta del estilo inicial, junto a los demás datos de semilla (como `divipola.json`). */
function leerEstiloInicialDelDisco(): Promise<string> {
  return readFile(path.join(resolverRaizServicio(), 'prisma/datos/estilo-inicial.md'), 'utf8');
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
    const { insertados, existentes, origenesDeTexto } = await dependencias.sembrar.ejecutar(contenido);
    const origenes =
      insertados > 0 && origenesDeTexto !== undefined
        ? `
texto inicial de «Tratamiento de datos»: ${String(origenesDeTexto.casoDelSistema)} del caso aviso_datos, ${String(origenesDeTexto.parametro)} de parametro, ${String(origenesDeTexto.respaldo)} de respaldo`
        : '';
    const casos = `casos:sembrar: ${String(insertados)} insertados, ${String(existentes)} ya existían.${origenes}`;
    try {
      const estilo = await dependencias.sembrarEstilo.ejecutar(await dependencias.leerEstiloInicial());
      const lineaEstilo = estilo.sembrado ? `estilo: sembrado v${String(estilo.version)}` : 'estilo: ya existía';
      return { limpio: true, mensaje: `${casos}
${lineaEstilo}` };
    } catch (error) {
      return { limpio: false, mensaje: `${casos}
estilo: no se pudo sembrar: ${(error as Error).message}` };
    }
  } catch (error) {
    return { limpio: false, mensaje: `casos:sembrar: no se pudo sembrar: ${(error as Error).message}` };
  }
}

/** Contexto mínimo del comando: configuración, reloj, `asistente` y el estilo editable, sin HTTP, el LLM ni las colas. */
@Module({ imports: [ConfiguracionModule, RelojModule, AsistenteModule, EstiloModule] })
class ContextoSembrarCasos {}

/**
 * Comando `npm run casos:sembrar` (CAS6): crea las categorías «Sistema» y «Políticas», los casos del sistema, «Tratamiento de datos» (CAS13)
 * y un caso por cada política de `parametro`, retirando de `parametro` lo que copió. Con `--archivo <ruta.json>` suma los casos de
 * desarrollo de ese archivo. Además siembra el estilo inicial del bot como versión 1 solo si `version_estilo` no tiene
 * ninguna versión (EST-D6). Idempotente; nunca pisa un caso ni un estilo existente.
 */
export async function sembrarCasos(argumentos: readonly string[] = []): Promise<ResultadoSembrarCasosCli> {
  try {
    const contexto = await NestFactory.createApplicationContext(ContextoSembrarCasos, { logger: false });
    try {
      return await ejecutarSembrarCasos(
        {
          sembrar: contexto.get(SembrarCasos),
          sembrarEstilo: contexto.get(SembrarEstilo),
          leerEstiloInicial: leerEstiloInicialDelDisco,
        },
        argumentos,
      );
    } finally {
      await contexto.close();
    }
  } catch (error) {
    return { limpio: false, mensaje: `casos:sembrar: no se pudo sembrar: ${(error as Error).message}` };
  }
}
