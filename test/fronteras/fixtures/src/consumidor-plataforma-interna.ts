// Fixture de fronteras (T7, D11 regla 6 — sin-rutas-internas-de-plataforma, violación): un
// archivo fuera de cualquier submódulo de plataforma/ MUST NOT importar una ruta interna de un
// submódulo, solo lo que ese submódulo exporta en su `index.ts`.
import { interno } from './plataforma/config/interno.js';

export const consumidorPlataformaInterna = interno;
