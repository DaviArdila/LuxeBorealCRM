import { Module } from '@nestjs/common';
import { PrismaModule } from '../../plataforma/prisma/index.js';
import { RedisModule } from '../../plataforma/redis/index.js';
import { AdministrarCasos } from './aplicacion/administrar-casos.js';
import { AdministrarCategorias } from './aplicacion/administrar-categorias.js';
import { AdministrarTextosDelSistema } from './aplicacion/administrar-textos-del-sistema.js';
import { ProveedorTextos } from './aplicacion/proveedor-textos.js';
import { SembrarCasos } from './aplicacion/sembrar-casos.js';
import { RepositorioAdministracionPrisma } from './infraestructura/prisma/repositorio-administracion-prisma.js';
import { RepositorioCasosPrisma } from './infraestructura/prisma/repositorio-casos-prisma.js';
import { RepositorioSemillaPrisma } from './infraestructura/prisma/repositorio-semilla-prisma.js';
import { VersionAsistenteRedis } from './infraestructura/redis/version-asistente-redis.js';
import { CONSULTA_CASOS } from './puertos/consulta-casos.js';
import { AsistenteController } from './interfaz/asistente.controller.js';
import { REPOSITORIO_ADMINISTRACION } from './puertos/repositorio-administracion.js';
import { REPOSITORIO_CASOS } from './puertos/repositorio-casos.js';
import { REPOSITORIO_SEMILLA } from './puertos/repositorio-semilla.js';
import { TEXTOS_ASISTENTE } from './puertos/textos-asistente.js';
import { VERSION_ASISTENTE } from './puertos/version-asistente.js';

/**
 * Casos de uso del asistente (Fase 12, ADR-0024): dueño de todo lo que el bot le dice al cliente. `AsistenteController` (T7, CAS9) expone la administración de categorías y casos al rol `admin`; en los contextos de comandos
 * (`casos:sembrar`) no hay servidor HTTP y queda inerte. `CLOCK` es global. `TEXTOS_ASISTENTE` es el único
 * puerto con el que los demás módulos piden un texto (T5 los corta a él); `AdministrarTextosDelSistema` lo usa el adaptador
 * de `mensajes-fijos` hasta que T8 lo reemplace por la pantalla de casos.
 */
@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [AsistenteController],
  providers: [
    { provide: REPOSITORIO_ADMINISTRACION, useClass: RepositorioAdministracionPrisma },
    AdministrarCategorias,
    AdministrarCasos,
    { provide: REPOSITORIO_CASOS, useClass: RepositorioCasosPrisma },
    { provide: REPOSITORIO_SEMILLA, useClass: RepositorioSemillaPrisma },
    { provide: VERSION_ASISTENTE, useClass: VersionAsistenteRedis },
    ProveedorTextos,
    { provide: TEXTOS_ASISTENTE, useExisting: ProveedorTextos },
    { provide: CONSULTA_CASOS, useExisting: ProveedorTextos },
    SembrarCasos,
    AdministrarTextosDelSistema,
  ],
  exports: [TEXTOS_ASISTENTE, CONSULTA_CASOS, SembrarCasos, AdministrarTextosDelSistema],
})
export class AsistenteModule {}
