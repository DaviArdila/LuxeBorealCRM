import { Module } from '@nestjs/common';
import { AsistenteModule } from '../asistente/index.js';
import { GuardarMensajeFijo } from './aplicacion/guardar-mensaje-fijo.js';
import { ListarMensajesFijos } from './aplicacion/listar-mensajes-fijos.js';
import { SembrarMensajesFijos } from './aplicacion/sembrar-mensajes-fijos.js';
import { CATALOGO_REAL } from './catalogo-real.js';
import { RepositorioMensajesFijosAsistente } from './infraestructura/repositorio-mensajes-fijos-asistente.js';
import { MensajesFijosController } from './interfaz/mensajes-fijos.controller.js';
import { CATALOGO_MENSAJES_FIJOS, REPOSITORIO_MENSAJES_FIJOS } from './puertos/repositorio-mensajes-fijos.js';

/**
 * Mensajes fijos editables (Fase 11b, D2): desde la Fase 12 (T5) es un adaptador delgado sobre `asistente`: el catálogo sale de
 * su lista de casos del sistema y los textos se leen y escriben en sus casos (listar, guardar, sembrar), hasta que T8 lo
 * retire. Ningún dueño lo conoce: la dependencia va solo de aquí hacia el barril de `asistente`.
 * `CLOCK` es global. `MensajesFijosController` (T4, CFN1/CFN2) los expone por la API para el rol `admin`; en el contexto
 * del comando `mensajes:sembrar` no hay servidor HTTP y queda inerte.
 */
@Module({
  imports: [AsistenteModule],
  controllers: [MensajesFijosController],
  providers: [
    { provide: CATALOGO_MENSAJES_FIJOS, useValue: CATALOGO_REAL },
    { provide: REPOSITORIO_MENSAJES_FIJOS, useClass: RepositorioMensajesFijosAsistente },
    ListarMensajesFijos,
    GuardarMensajeFijo,
    SembrarMensajesFijos,
  ],
  exports: [ListarMensajesFijos, GuardarMensajeFijo, SembrarMensajesFijos],
})
export class MensajesFijosModule {}
