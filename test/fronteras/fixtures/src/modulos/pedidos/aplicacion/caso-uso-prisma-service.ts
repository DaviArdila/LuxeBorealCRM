// Fixture de fronteras (T3, D10 regla 12 — prisma-service-solo-en-infraestructura, violación):
// aplicacion/ MUST NOT importar PrismaService desde plataforma/prisma, ni siquiera a través de su
// barril público index.ts — el hueco que la regla 4 no cubre (D10).
import '../../../plataforma/prisma/index.js';

export const casoUsoPrismaService = 1;
