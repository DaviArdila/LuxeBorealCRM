// Fixture de fronteras (T7, D11 regla 5 — sin-rutas-internas-de-modulo, violación): un módulo
// MUST NOT importar una ruta interna de otro módulo, solo lo que ese módulo exporta en su
// `index.ts`.
import { casoUsoPrisma } from '../pedidos/aplicacion/caso-uso-prisma.js';

export const rutaInterna = casoUsoPrisma;
