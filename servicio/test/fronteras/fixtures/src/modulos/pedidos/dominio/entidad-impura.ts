// Fixture de fronteras (T7, D11 regla 3 — dominio-aislado, violación): dominio/ MUST NOT importar
// infraestructura/, ni siquiera de su propio módulo.
import { repo } from '../infraestructura/repo.js';

export const entidadImpura = repo;
