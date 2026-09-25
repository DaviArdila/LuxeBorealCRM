import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Prisma 7 (D6 de openspec/changes/fase-00a-esqueleto/design.md): la URL de conexión ya no va en
// `prisma/schema.prisma`, sino en `datasource.url` de este archivo — es lo único que expone
// `PrismaConfig` (`node_modules/@prisma/config/dist/index.d.ts`; no existe un campo `adapter` en
// esta versión, a diferencia de lo que sugiere cierta documentación de migración). El CLI de
// Prisma (`prisma generate`, futuras migraciones) lee esta URL; `PrismaService`
// (src/plataforma/prisma/prisma.service.ts) usa su propio adaptador `@prisma/adapter-pg` en
// tiempo de ejecución, independiente de este archivo.
//
// `prisma generate` no conecta a una base real, pero evalúa `DATABASE_URL`; `npm run
// prisma:generar` (script `postinstall`, D6) usa un valor de relleno no secreto cuando la
// variable no está definida, para que instalar el proyecto sin un `.env` todavía no rompa la
// generación del cliente.
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://generar:generar@localhost:5432/generar',
  },
  // Explícito desde la Fase 01 (T2, design.md §"File Changes"): mismo valor que el default de
  // Prisma, pero declarado para que la ubicación de las migraciones no dependa de una convención
  // implícita. Sin `seed`: la semilla DANE (T4) es un comando explícito de `package.json`
  // (`npm run semilla:geografia`), nunca un efecto secundario de `prisma migrate`.
  migrations: {
    path: path.join('prisma', 'migrations'),
  },
});
