import { Module } from '@nestjs/common';
import { PrismaModule } from '../../plataforma/prisma/index.js';
import { RedisModule } from '../../plataforma/redis/index.js';
import { CotizarEnvio } from './aplicacion/cotizar-envio.js';
import { ListarProductosActivos } from './aplicacion/listar-productos-activos.js';
import { ObtenerCatalogoCompacto } from './aplicacion/obtener-catalogo-compacto.js';
import { ObtenerFichaProducto } from './aplicacion/obtener-ficha-producto.js';
import { CacheCatalogoRedis } from './infraestructura/cache-catalogo-redis.js';
import { RepositorioEnvioPrisma } from './infraestructura/repositorio-envio-prisma.js';
import { RepositorioParametroCatalogoPrisma } from './infraestructura/repositorio-parametro-prisma.js';
import { RepositorioProductoPrisma } from './infraestructura/repositorio-producto-prisma.js';
import { CACHE_CATALOGO } from './puertos/cache-catalogo.js';
import { REPOSITORIO_ENVIO } from './puertos/repositorio-envio.js';
import { REPOSITORIO_PARAMETRO_CATALOGO } from './puertos/repositorio-parametro.js';
import { REPOSITORIO_PRODUCTO } from './puertos/repositorio-producto.js';

/**
 * Módulo de catálogo (design.md, tabla "Módulos tocados y dependencias"): hoja del monolito, no
 * depende de `modulos/geografia` (D1) ni de `modulos/horario`. Registra los adaptadores Prisma
 * (T5) y Redis (T7) de esta fase detrás de sus puertos, y los cuatro casos de uso de aplicación
 * (T8). `RedisModule` se importa explícito porque, a diferencia de `plataforma/reloj`, no es
 * `@Global()` (skill `luxeboreal-arquitectura`); `CLOCK` le llega a `CacheCatalogoRedis` sin
 * import adicional. `AppModule` MUST NOT importarlo todavía — lo hará la primera fase que lo
 * necesite (07), igual que `GeografiaModule`/`HorarioModule` quedaron sin registrar tras sus fases.
 */
@Module({
  imports: [PrismaModule, RedisModule],
  providers: [
    { provide: REPOSITORIO_PRODUCTO, useClass: RepositorioProductoPrisma },
    { provide: REPOSITORIO_ENVIO, useClass: RepositorioEnvioPrisma },
    { provide: REPOSITORIO_PARAMETRO_CATALOGO, useClass: RepositorioParametroCatalogoPrisma },
    { provide: CACHE_CATALOGO, useClass: CacheCatalogoRedis },
    ObtenerFichaProducto,
    ListarProductosActivos,
    ObtenerCatalogoCompacto,
    CotizarEnvio,
  ],
  exports: [ObtenerFichaProducto, ListarProductosActivos, ObtenerCatalogoCompacto, CotizarEnvio],
})
export class CatalogoModule {}
