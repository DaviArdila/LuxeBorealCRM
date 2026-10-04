// Fixture de fronteras (T7, D11 regla 4 — prisma-solo-en-infraestructura, violación):
// aplicacion/ MUST NOT importar `@prisma/client` directamente; solo infraestructura/ puede.
import '@prisma/client';

export const casoUsoPrisma = 1;
