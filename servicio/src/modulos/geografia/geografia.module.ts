import { Module } from '@nestjs/common';
import { PrismaModule } from '../../plataforma/prisma/index.js';
import { SembrarGeografia } from './aplicacion/sembrar-geografia.js';
import { RepositorioGeografiaPrisma } from './infraestructura/repositorio-geografia-prisma.js';
import { REPOSITORIO_GEOGRAFIA } from './puertos/repositorio-geografia.js';

/**
 * Módulo del catálogo geográfico DANE (design.md D8): hoja del monolito, no depende de ningún otro
 * módulo de negocio. `AppModule` MUST NOT importarlo todavía — lo hará la Fase 02 (D8, `tasks.md`
 * T3 REFACTOR). Es la raíz de composición del módulo: la única pieza fuera de `infraestructura/`
 * que puede importar `plataforma/prisma` (PER14). `SembrarGeografia` (T4) se exporta para que
 * `scripts/sembrar-geografia.ts` lo resuelva desde su contexto Nest sin HTTP.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    { provide: REPOSITORIO_GEOGRAFIA, useClass: RepositorioGeografiaPrisma },
    SembrarGeografia,
  ],
  exports: [REPOSITORIO_GEOGRAFIA, SembrarGeografia],
})
export class GeografiaModule {}
