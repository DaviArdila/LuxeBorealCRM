// Fixture de fronteras (T7, D11 regla 2 — compartido-puro): compartido/ MUST NOT importar nada
// fuera de sí mismo, ni siquiera un paquete de npm real como `zod`.
import { z } from 'zod';

export const impuro = z.string();
