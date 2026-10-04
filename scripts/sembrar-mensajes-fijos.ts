import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MensajesFijosModule, SembrarMensajesFijos } from '../src/modulos/mensajes-fijos/index.js';
import { ConfiguracionModule } from '../src/plataforma/config/index.js';
import { RelojModule } from '../src/plataforma/reloj/index.js';

export interface ResultadoSembrarMensajesFijosCli {
  readonly limpio: boolean;
  readonly mensaje: string;
}

/** Lo que el comando necesita del caso de uso, como doble en las pruebas y como el real en producción. */
export interface DependenciasSembrarMensajes {
  readonly sembrar: Pick<SembrarMensajesFijos, 'ejecutar'>;
}

/** Ejecuta la semilla y arma el reporte: cuántas insertó y cuántas ya existían, nunca los textos (CFN3, R14). */
export async function ejecutarSembrarMensajesFijos(
  dependencias: DependenciasSembrarMensajes,
): Promise<ResultadoSembrarMensajesFijosCli> {
  try {
    const { insertadas, existentes } = await dependencias.sembrar.ejecutar();
    return { limpio: true, mensaje: `mensajes:sembrar: ${String(insertadas)} insertadas, ${String(existentes)} ya existían.` };
  } catch (error) {
    return { limpio: false, mensaje: `mensajes:sembrar: no se pudo sembrar: ${(error as Error).message}` };
  }
}

/** Contexto mínimo del comando: configuración, reloj y `mensajes-fijos`, sin HTTP, el LLM ni las colas. */
@Module({ imports: [ConfiguracionModule, RelojModule, MensajesFijosModule] })
class ContextoSembrarMensajesFijos {}

/**
 * Comando `npm run mensajes:sembrar` (CFN3, D5): inserta en `parametro` los mensajes fijos que no tienen fila, con su
 * texto de respaldo, sin tocar los que ya existen. Idempotente; mismo patrón que `semilla:geografia`.
 */
export async function sembrarMensajesFijos(): Promise<ResultadoSembrarMensajesFijosCli> {
  try {
    const contexto = await NestFactory.createApplicationContext(ContextoSembrarMensajesFijos, { logger: false });
    try {
      return await ejecutarSembrarMensajesFijos({ sembrar: contexto.get(SembrarMensajesFijos) });
    } finally {
      await contexto.close();
    }
  } catch (error) {
    return { limpio: false, mensaje: `mensajes:sembrar: no se pudo sembrar: ${(error as Error).message}` };
  }
}
