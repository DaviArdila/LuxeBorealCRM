import { Module } from '@nestjs/common';
import { PrismaModule } from '../../plataforma/prisma/index.js';
import { GuardarMensajeFijo } from './aplicacion/guardar-mensaje-fijo.js';
import { ListarMensajesFijos } from './aplicacion/listar-mensajes-fijos.js';
import { SembrarMensajesFijos } from './aplicacion/sembrar-mensajes-fijos.js';
import { CATALOGO_REAL } from './catalogo-real.js';
import { RepositorioMensajesFijosPrisma } from './infraestructura/prisma/repositorio-mensajes-fijos-prisma.js';
import { MensajesFijosController } from './interfaz/mensajes-fijos.controller.js';
import { CATALOGO_MENSAJES_FIJOS, REPOSITORIO_MENSAJES_FIJOS } from './puertos/repositorio-mensajes-fijos.js';

/**
 * Mensajes fijos editables (Fase 11b, D2): lee el catálogo de textos de cada módulo dueño y administra sus filas en
 * `parametro` (listar, guardar, sembrar). Ningún dueño lo conoce: la dependencia va solo de aquí hacia sus barriles.
 * `CLOCK` es global. `MensajesFijosController` (T4, CFN1/CFN2) los expone por la API para el rol `admin`; en el contexto
 * del comando `mensajes:sembrar` no hay servidor HTTP y queda inerte.
 */
@Module({
  imports: [PrismaModule],
  controllers: [MensajesFijosController],
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
