// Fixture de fronteras (T7, D11 regla 9 — src-sin-dev-dependencies, violación): `src/` MUST NOT
// importar una dependencia declarada en `devDependencies` (aquí, `vitest`).
import { vi } from 'vitest';

export const consumidorDevDependency = vi;
