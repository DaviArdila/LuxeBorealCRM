// Fixture de fronteras (T3, D11 regla 3 — dominio-aislado, caso permitido nuevo): un test unitario
// colocado junto al código de dominio/ puede importar `vitest` (devDependency), igual que ya
// permite la regla 9 para el resto de src/ (hallazgo real de T3: geografia.spec.ts bajo dominio/
// disparaba esta regla antes de este ajuste).
import { vi } from 'vitest';

export const testDouble = vi;
