import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { GeografiaModule, SembrarGeografia } from '../src/modulos/geografia/index.js';
import { ConfiguracionModule } from '../src/plataforma/config/index.js';
import { resolverRaizRepositorio } from './herramientas.js';

/**
 * Módulo raíz mínimo del contexto de la semilla (design.md D8): compone la configuración global
 * (única lectora de `process.env`, PLT1) y `GeografiaModule`, sin levantar HTTP.
 */
@Module({ imports: [ConfiguracionModule, GeografiaModule] })
class ContextoSemillaGeografia {}

export interface ResultadoSemillaGeografia {
  readonly limpio: boolean;
  readonly mensaje: string;
}

/**
 * Comando explícito `npm run semilla:geografia` (design.md D8, invocación): lee
 * `prisma/datos/divipola.json`, ejecuta `SembrarGeografia` en un contexto Nest sin HTTP
 * (`NestFactory.createApplicationContext`) y lo cierra (`$disconnect`, A1). Nunca se invoca al
 * arrancar la aplicación ni al importar este módulo — solo `scripts/cli.ts` lo dispara.
 */
export async function sembrarGeografia(): Promise<ResultadoSemillaGeografia> {
  try {
    const raiz = resolverRaizRepositorio();
    const textoFuente = await readFile(path.join(raiz, 'prisma/datos/divipola.json'), 'utf8');

    const contexto = await NestFactory.createApplicationContext(ContextoSemillaGeografia, {
      logger: false,
    });
    try {
      const casoDeUso = contexto.get(SembrarGeografia);
      const resumen = await casoDeUso.ejecutar(textoFuente);

      const totalDepartamentos =
        resumen.departamentos.insertados +
        resumen.departamentos.actualizados +
        resumen.departamentos.sinCambios;
      const totalCiudades =
        resumen.ciudades.insertados + resumen.ciudades.actualizados + resumen.ciudades.sinCambios;
      const insertadas = resumen.departamentos.insertados + resumen.ciudades.insertados;
      const actualizadas = resumen.departamentos.actualizados + resumen.ciudades.actualizados;
      const sinCambios = resumen.departamentos.sinCambios + resumen.ciudades.sinCambios;

      return {
        limpio: true,
        mensaje:
          `Geografía sembrada: ${totalDepartamentos} departamentos, ${totalCiudades} ciudades ` +
          `(insertadas ${insertadas}, actualizadas ${actualizadas}, sin cambios ${sinCambios})`,
      };
    } finally {
      await contexto.close();
    }
  } catch (error) {
    return {
      limpio: false,
      mensaje: `semilla:geografia: no se pudo sembrar la geografía: ${(error as Error).message}`,
    };
  }
}
