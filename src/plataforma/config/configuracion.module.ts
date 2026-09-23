import { Global, Module } from '@nestjs/common';
import { cargarConfiguracion } from './cargar-configuracion.js';
import type { Configuracion } from './esquema.js';

/** Token de inyección de la {@link Configuracion} validada (PLT1). */
export const CONFIGURACION = Symbol('CONFIGURACION');

/**
 * Módulo global de configuración (PLT1). Su factory es la **única** lectura de `process.env` del
 * sistema: valida contra {@link cargarConfiguracion} al construir el módulo, antes de aceptar
 * tráfico. Si la configuración es inválida, `NestFactory.create` falla y el proceso termina con
 * código distinto de cero (ninguna otra parte del código lee `process.env` directamente).
 */
@Global()
@Module({
  providers: [
    {
      provide: CONFIGURACION,
      useFactory: (): Configuracion => cargarConfiguracion(process.env),
    },
  ],
  exports: [CONFIGURACION],
})
export class ConfiguracionModule {}
