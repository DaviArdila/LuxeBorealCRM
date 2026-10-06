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
}

/** Ejecuta la semilla y arma el reporte: cuántos casos insertó y cuántos ya existían, nunca los textos (CAS6, R14). */
export async function ejecutarSembrarCasos(dependencias: DependenciasSembrarCasos): Promise<ResultadoSembrarCasosCli> {
  try {
    const { insertados, existentes } = await dependencias.sembrar.ejecutar();
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
 * por cada política de `parametro`, retirando de `parametro` lo que copió. Idempotente; nunca pisa un caso existente.
 */
export async function sembrarCasos(): Promise<ResultadoSembrarCasosCli> {
  try {
    const contexto = await NestFactory.createApplicationContext(ContextoSembrarCasos, { logger: false });
    try {
      return await ejecutarSembrarCasos({ sembrar: contexto.get(SembrarCasos) });
    } finally {
      await contexto.close();
    }
  } catch (error) {
    return { limpio: false, mensaje: `casos:sembrar: no se pudo sembrar: ${(error as Error).message}` };
  }
}
