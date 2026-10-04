import { Module } from '@nestjs/common';
import { PrismaModule } from '../../plataforma/prisma/index.js';
import { RedisModule } from '../../plataforma/redis/index.js';
import { ListarHistorialEstilo } from './aplicacion/listar-historial-estilo.js';
import { ProveedorEstilo } from './aplicacion/proveedor-estilo.js';
import { PublicarEstilo } from './aplicacion/publicar-estilo.js';
import { RestaurarEstilo } from './aplicacion/restaurar-estilo.js';
import { RepositorioEstiloPrisma } from './infraestructura/prisma/repositorio-estilo-prisma.js';
import { CargadorPrompts } from './infraestructura/prompts/cargador-prompts.js';
import { VersionEstiloRedis } from './infraestructura/redis/version-estilo-redis.js';
import { EstiloController } from './interfaz/estilo.controller.js';
import { REPOSITORIO_ESTILO } from './puertos/repositorio-estilo.js';
import { VERSION_ESTILO } from './puertos/version-estilo.js';

/**
 * Estilo editable del agente (Fase 08c, ADR-0020): lectura con respaldo en archivo y copia en memoria
 * (`ProveedorEstilo`), publicación, restauración e historial. Es un módulo aparte para que `AgenteModule`
 * lo use y el comando `prompt:estilo` lo componga sin levantar el LLM, los leads ni las colas. `CargadorPrompts`
 * vive aquí porque el archivo de estilo es el respaldo del proveedor. `EstiloController` (Fase 11b, AGT23) lo expone por la
 * API para el rol `admin`; en el contexto del comando no hay servidor HTTP y queda inerte.
 */
@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [EstiloController],
  providers: [
    { provide: REPOSITORIO_ESTILO, useClass: RepositorioEstiloPrisma },
    { provide: VERSION_ESTILO, useClass: VersionEstiloRedis },
    CargadorPrompts,
    ProveedorEstilo,
    PublicarEstilo,
    RestaurarEstilo,
    ListarHistorialEstilo,
  ],
  exports: [CargadorPrompts, ProveedorEstilo, PublicarEstilo, RestaurarEstilo, ListarHistorialEstilo],
})
export class EstiloModule {}
