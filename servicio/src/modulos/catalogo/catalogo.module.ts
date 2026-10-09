import { Module } from '@nestjs/common';
import { GeografiaModule } from '../geografia/index.js';
import { MediosModule } from '../medios/index.js';
import { PrismaModule } from '../../plataforma/prisma/index.js';
import { RedisModule } from '../../plataforma/redis/index.js';
import { BuscarProductos } from './aplicacion/buscar-productos.js';
import { CotizarEnvio } from './aplicacion/cotizar-envio.js';
import { ImportarCatalogo } from './aplicacion/importar-catalogo.js';
import { ListarProductosActivos } from './aplicacion/listar-productos-activos.js';
import { ObtenerCatalogoCompacto } from './aplicacion/obtener-catalogo-compacto.js';
import { ObtenerFotosProducto } from './aplicacion/obtener-fotos-producto.js';
import { ObtenerFichaProducto } from './aplicacion/obtener-ficha-producto.js';
import { ObtenerNombreProducto } from './aplicacion/obtener-nombre-producto.js';
import { ProcesarFotos } from './aplicacion/procesar-fotos.js';
import { ResolverGeografiaImportacion } from './aplicacion/resolver-geografia-importacion.js';
import { CacheCatalogoRedis } from './infraestructura/cache-catalogo-redis.js';
import { RepositorioEnvioPrisma } from './infraestructura/repositorio-envio-prisma.js';
import { RepositorioImportacionPrisma } from './infraestructura/repositorio-importacion-prisma.js';
import { RepositorioParametroCatalogoPrisma } from './infraestructura/repositorio-parametro-prisma.js';
import { RepositorioProductoPrisma } from './infraestructura/repositorio-producto-prisma.js';
import { InvalidarCacheCatalogo } from './aplicacion/invalidar-cache-catalogo.js';
import { CACHE_CATALOGO } from './puertos/cache-catalogo.js';
import { REPOSITORIO_ENVIO } from './puertos/repositorio-envio.js';
import { REPOSITORIO_IMPORTACION_CATALOGO } from './puertos/repositorio-importacion.js';
import { REPOSITORIO_PARAMETRO_CATALOGO } from './puertos/repositorio-parametro.js';
import { REPOSITORIO_PRODUCTO } from './puertos/repositorio-producto.js';

/**
 * Módulo de catálogo (design.md, tabla "Módulos tocados y dependencias"): hoja del monolito hasta
 * la Fase 02; desde esta fase (03) depende de `modulos/geografia` (D5: `resolverGeografiaImportacion`
 * resuelve departamento/ciudad a código DANE, IMP9) y de `modulos/medios` (D1: `ALMACENAMIENTO`,
 * `construirCollage`, consumidos por `ProcesarFotos`). Registra los adaptadores Prisma (T5, T7) y
 * Redis (T7) detrás de sus puertos, y los casos de uso de aplicación de ambas fases. `RedisModule`
 * se importa explícito porque, a diferencia de `plataforma/reloj`, no es `@Global()` (skill
 * `luxeboreal-arquitectura`); `CLOCK` le llega a `CacheCatalogoRedis`/`ImportarCatalogo` sin import
 * adicional. `AppModule` no lo registra: lo importa `AgenteModule` (Fase 07b), que envuelve sus casos de uso
 * en las herramientas del LLM.
 *
 * Nota de deviación (reportada, no silenciosa, T9): `FUENTE_CATALOGO` (puerto de lectura del
 * catálogo, D2) MUST NOT registrarse aquí con un adaptador fijo — a diferencia de
 * `REPOSITORIO_IMPORTACION_CATALOGO` (siempre `RepositorioImportacionPrisma`), la elección entre
 * `FuenteCatalogoSheets`/`FuenteCatalogoDirectorio` depende de qué flag de CLI (`--sheet-id`/`--dir`)
 * usó el usuario en esa corrida — una decisión en tiempo de ejecución que solo conoce el comando
 * (`scripts/importar-catalogo.ts`, T10, todavía no construido), no este módulo estático. `T10`
 * MUST proveer `FUENTE_CATALOGO` en el contexto de aplicación del CLI antes de resolver
 * `ImportarCatalogo`.
 */
@Module({
  imports: [PrismaModule, RedisModule, GeografiaModule, MediosModule],
  providers: [
    { provide: REPOSITORIO_PRODUCTO, useClass: RepositorioProductoPrisma },
    { provide: REPOSITORIO_ENVIO, useClass: RepositorioEnvioPrisma },
    { provide: REPOSITORIO_PARAMETRO_CATALOGO, useClass: RepositorioParametroCatalogoPrisma },
    { provide: REPOSITORIO_IMPORTACION_CATALOGO, useClass: RepositorioImportacionPrisma },
    { provide: CACHE_CATALOGO, useClass: CacheCatalogoRedis },
    ObtenerFichaProducto,
    ObtenerNombreProducto,
    ListarProductosActivos,
    BuscarProductos,
    ObtenerFotosProducto,
    ObtenerCatalogoCompacto,
    CotizarEnvio,
    ResolverGeografiaImportacion,
    ProcesarFotos,
    ImportarCatalogo,
    InvalidarCacheCatalogo,
  ],
  exports: [
    ObtenerFichaProducto,
    ObtenerNombreProducto,
    ListarProductosActivos,
    BuscarProductos,
    ObtenerFotosProducto,
    ObtenerCatalogoCompacto,
    CotizarEnvio,
    ImportarCatalogo,
    InvalidarCacheCatalogo,
  ],
})
export class CatalogoModule {}
