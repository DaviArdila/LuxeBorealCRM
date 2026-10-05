// Fixture de fronteras (T7, D11 regla 6 — violación): un submódulo de plataforma MUST NOT
// importar archivos internos de otro submódulo.
import { interno } from '../config/interno.js';

export const consumidorConfigInterna = interno;
