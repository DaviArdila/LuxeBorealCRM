// Fixture de fronteras (T7, D11 regla 7 — plataforma-no-conoce-modulos, violación):
// plataforma/ MUST NOT importar nada de modulos/, ni siquiera su `index.ts`.
import { casoUsoPrisma } from '../modulos/pedidos/index.js';

export const consumidorModulos = casoUsoPrisma;
