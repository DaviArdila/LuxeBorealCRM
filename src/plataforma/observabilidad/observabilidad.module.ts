import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { CONFIGURACION } from '../config/index.js';
import type { Configuracion } from '../config/index.js';
import { crearOpcionesLogger } from './crear-opciones-logger.js';

/**
 * Módulo de observabilidad (PLT3, R14). Registra `nestjs-pino` con las opciones de
 * {@link crearOpcionesLogger}, construidas a partir de la {@link Configuracion} validada por
 * `plataforma/config` — la factory no lee `process.env` directamente.
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [CONFIGURACION],
      useFactory: (configuracion: Configuracion) => crearOpcionesLogger(configuracion),
    }),
  ],
  exports: [LoggerModule],
})
export class ObservabilidadModule {}
