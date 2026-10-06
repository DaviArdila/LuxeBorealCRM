import { Module } from '@nestjs/common';
import { PrismaModule } from '../../plataforma/prisma/index.js';
import { CatalogoModule } from '../catalogo/index.js';
import { AdministrarConfiguracion } from './aplicacion/administrar-configuracion.js';
import { InvalidadorDeCachesCatalogo } from './infraestructura/invalidador-de-caches-catalogo.js';
import { RepositorioConfiguracionPrisma } from './infraestructura/repositorio-configuracion-prisma.js';
import { ConfiguracionController } from './interfaz/configuracion.controller.js';
import { INVALIDADOR_DE_CACHES } from './puertos/invalidador-caches.js';
import { REPOSITORIO_CONFIGURACION } from './puertos/repositorio-configuracion.js';

/**
 * Configuración del negocio (Fase 12, CFG1-CFG6): horario, envíos y gasto del LLM como grupos tipados sobre `parametro` y
 * `excepcion_horario`, solo para el rol `admin`. Los módulos que leen estos valores (`horario`, `catalogo`, `llm`) siguen
 * leyéndolos por sus propios puertos; este módulo solo escribe, y al guardar descarta la caché del catálogo (CFG5).
 */
@Module({
  imports: [PrismaModule, CatalogoModule],
  controllers: [ConfiguracionController],
  providers: [
    { provide: REPOSITORIO_CONFIGURACION, useClass: RepositorioConfiguracionPrisma },
    { provide: INVALIDADOR_DE_CACHES, useClass: InvalidadorDeCachesCatalogo },
    AdministrarConfiguracion,
  ],
})
export class ConfiguracionNegocioModule {}
