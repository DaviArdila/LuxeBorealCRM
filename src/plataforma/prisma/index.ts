/**
 * Superficie pública de `plataforma/prisma` (D6). Nadie fuera de este módulo importa rutas
 * internas (`./prisma.service.js`, `./generado/...`) — regla de fronteras
 * `sin-rutas-internas-de-plataforma`; los tipos de Prisma no salen de aquí más que a través de
 * `PrismaService`.
 */
export { PrismaModule } from './prisma.module.js';
export { PrismaService } from './prisma.service.js';
