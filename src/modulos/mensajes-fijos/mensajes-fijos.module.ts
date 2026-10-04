import { Module } from '@nestjs/common';
import { PrismaModule } from '../../plataforma/prisma/index.js';
import { GuardarMensajeFijo } from './aplicacion/guardar-mensaje-fijo.js';
import { ListarMensajesFijos } from './aplicacion/listar-mensajes-fijos.js';
import { SembrarMensajesFijos } from './aplicacion/sembrar-mensajes-fijos.js';
import { CATALOGO_REAL } from './catalogo-real.js';
import { RepositorioMensajesFijosPrisma } from './infraestructura/prisma/repositorio-mensajes-fijos-prisma.js';
import { CATALOGO_MENSAJES_FIJOS, REPOSITORIO_MENSAJES_FIJOS } from './puertos/repositorio-mensajes-fijos.js';

/**
 * Mensajes fijos editables (Fase 11b, D2): lee el catálogo de textos de cada módulo dueño y administra sus filas en
 * `parametro` (listar, guardar, sembrar). Ningún dueño lo conoce: la dependencia va solo de aquí hacia sus barriles.
 * `CLOCK` es global. T4 le agrega el controlador y lo registra en `AppModule`.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    { provide: CATALOGO_MENSAJES_FIJOS, useValue: CATALOGO_REAL },
    { provide: REPOSITORIO_MENSAJES_FIJOS, useClass: RepositorioMensajesFijosPrisma },
    ListarMensajesFijos,
    GuardarMensajeFijo,
    SembrarMensajesFijos,
  ],
  exports: [ListarMensajesFijos, GuardarMensajeFijo, SembrarMensajesFijos],
})
export class MensajesFijosModule {}
