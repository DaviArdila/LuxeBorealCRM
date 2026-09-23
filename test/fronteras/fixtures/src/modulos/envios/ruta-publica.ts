// Fixture de fronteras (T7, D11 regla 5 — sin-rutas-internas-de-modulo, caso permitido): un
// módulo puede importar el `index.ts` de otro módulo.
import { casoUsoPrisma } from '../pedidos/index.js';

export const rutaPublica = casoUsoPrisma;
