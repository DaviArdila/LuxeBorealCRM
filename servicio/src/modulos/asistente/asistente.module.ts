import { Module } from '@nestjs/common';
import { PrismaModule } from '../../plataforma/prisma/index.js';
import { RedisModule } from '../../plataforma/redis/index.js';
import { AdministrarTextosDelSistema } from './aplicacion/administrar-textos-del-sistema.js';
import { ProveedorTextos } from './aplicacion/proveedor-textos.js';
import { SembrarCasos } from './aplicacion/sembrar-casos.js';
import { RepositorioCasosPrisma } from './infraestructura/prisma/repositorio-casos-prisma.js';
import { RepositorioSemillaPrisma } from './infraestructura/prisma/repositorio-semilla-prisma.js';
import { VersionAsistenteRedis } from './infraestructura/redis/version-asistente-redis.js';
import { REPOSITORIO_CASOS } from './puertos/repositorio-casos.js';
import { REPOSITORIO_SEMILLA } from './puertos/repositorio-semilla.js';
import { TEXTOS_ASISTENTE } from './puertos/textos-asistente.js';
import { VERSION_ASISTENTE } from './puertos/version-asistente.js';

/**
 * Casos de uso del asistente (Fase 12, ADR-0024): dueño de todo lo que el bot le dice al cliente. `CLOCK` es global. `TEXTOS_ASISTENTE` es el único
 * puerto con el que los demás módulos piden un texto (T5 los corta a él); `AdministrarTextosDelSistema` lo usa el adaptador
 * de `mensajes-fijos` hasta que T8 lo reemplace por la pantalla de casos.
 */
@Module({
  imports: [PrismaModule, RedisModule],
  providers: [
    { provide: REPOSITORIO_CASOS, useClass: RepositorioCasosPrisma },
    { provide: REPOSITORIO_SEMILLA, useClass: RepositorioSemillaPrisma },
    { provide: VERSION_ASISTENTE, useClass: VersionAsistenteRedis },
    ProveedorTextos,
    { provide: TEXTOS_ASISTENTE, useExisting: ProveedorTextos },
    SembrarCasos,
    AdministrarTextosDelSistema,
  ],
  exports: [TEXTOS_ASISTENTE, SembrarCasos, AdministrarTextosDelSistema],
})
export class AsistenteModule {}
