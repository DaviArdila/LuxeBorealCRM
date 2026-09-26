// Fixture de fronteras (T4 de fase-01-persistencia, D11 regla 8 — src-no-importa-test, caso
// permitido nuevo): un test unitario colocado junto a `aplicacion/` puede importar un doble de
// `test/fakes/` (aquí, el fixture `test/doble-interno.ts`), igual que ya permite la regla 3 para
// `dominio/*.spec.ts` — hallazgo real: `sembrar-geografia.spec.ts` necesita
// `RepositorioGeografiaEnMemoria` de `test/fakes/` para probar el caso de uso con un puerto falso.
import { doble } from '../../../../test/doble-interno.js';

export const casoUsoConDoble = doble;
