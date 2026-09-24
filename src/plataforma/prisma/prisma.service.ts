import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { CONFIGURACION } from '../config/index.js';
import type { Configuracion } from '../config/index.js';
import { PrismaClient } from './generado/client.js';

/**
 * Subclase del `PrismaClient` generado (D6 de `design.md`) con el adaptador `@prisma/adapter-pg`
 * — la vía oficial de Prisma 7 para conectar con `pg`. No conecta al construirse (A1): Prisma
 * conecta perezosamente en la primera consulta real (`$queryRaw` del smoke de T8, los
 * indicadores de salud de T9).
 *
 * El cierre en {@link onApplicationShutdown} (`$disconnect()`) queda implementado aquí (T8); T9
 * solo necesita `app.enableShutdownHooks()` en `configurarAplicacion` para que Nest lo dispare —
 * no vuelve a tocar este archivo.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnApplicationShutdown {
  constructor(@Inject(CONFIGURACION) configuracion: Configuracion) {
    super({ adapter: new PrismaPg({ connectionString: configuracion.DATABASE_URL }) });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
