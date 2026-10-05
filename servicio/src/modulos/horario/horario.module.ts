import { Module } from '@nestjs/common';
import { PrismaModule } from '../../plataforma/prisma/index.js';
import { HorarioAtencion } from './aplicacion/horario-atencion.js';
import { RepositorioHorarioPrisma } from './infraestructura/repositorio-horario-prisma.js';
import { HORARIO } from './puertos/horario.js';
import { REPOSITORIO_HORARIO } from './puertos/repositorio-horario.js';

/**
 * Módulo del puerto `Horario` (design.md, tabla "Módulos tocados y dependencias"): hoja del
 * monolito con dominio puro (`dominio/horario.js`, sin imports) y aplicación fina
 * (`HorarioAtencion`, T9) que orquesta `RepositorioHorario` + el `Clock` inyectado (PLT2, ya
 * exportado como `@Global()` por `RelojModule`, no se reexporta aquí). `AppModule` MUST NOT
 * importarlo todavía — lo hará la primera fase que lo necesite (07/08), igual que `GeografiaModule`
 * quedó sin registrar tras la Fase 01.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    { provide: REPOSITORIO_HORARIO, useClass: RepositorioHorarioPrisma },
    { provide: HORARIO, useClass: HorarioAtencion },
  ],
  exports: [HORARIO],
})
export class HorarioModule {}
