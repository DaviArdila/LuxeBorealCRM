// Fixture de fronteras (T7, D11 regla 6 — permitido): otro submódulo de plataforma puede importar
// la API pública expuesta por `index.ts`.
import { interno } from '../config/index.js';

export const consumidorConfigPublica = interno;
