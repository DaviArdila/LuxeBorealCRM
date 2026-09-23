// Fixture de fronteras (T7, D11 regla 6 — permitido): un submódulo puede importar sus propios
// archivos internos.
import { interno } from './interno.js';

export const consumidorInterno = interno;
