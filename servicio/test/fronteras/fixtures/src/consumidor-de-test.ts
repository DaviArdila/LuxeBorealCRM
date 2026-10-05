// Fixture de fronteras (T7, D11 regla 8 — src-no-importa-test, violación): `src/` MUST NOT
// importar nada de `test/`; los dobles de prueba viven en `test/fakes/`, nunca al revés.
import { doble } from '../test/doble-interno.js';

export const consumidorDeTest = doble;
