import { Module } from '@nestjs/common';
import { PrismaModule } from '../../plataforma/prisma/index.js';
import { RepositorioGeografiaPrisma } from './infraestructura/repositorio-geografia-prisma.js';
import { REPOSITORIO_GEOGRAFIA } from './puertos/repositorio-geografia.js';

/**
 * Módulo del catálogo geográfico DANE (design.md D8): hoja del monolito, no depende de ningún otro
 * módulo de negocio. `AppModule` MUST NOT importarlo todavía — lo hará la Fase 02 (D8, `tasks.md`
 * T3 REFACTOR). Es la raíz de composición del módulo: la única pieza fuera de `infraestructura/`
 * que puede importar `plataforma/prisma` (PER14).
 */
@Module({
  imports: [PrismaModule],
  providers: [{ provide: REPOSITORIO_GEOGRAFIA, useClass: RepositorioGeografiaPrisma }],
  exports: [REPOSITORIO_GEOGRAFIA],
})
export class GeografiaModule {}
