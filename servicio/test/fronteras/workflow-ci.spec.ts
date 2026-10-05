import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * `.github/workflows/ci.yml` y la composición final de `npm run ci` (CI5, CI6, CI7, D8). Estos
 * tres escenarios son pruebas de **contenido**, no de ejecución: inspeccionan el YAML y el
 * `package.json` reales sin correr GitHub Actions (Q4 de `proposal.md` — el repositorio no tiene
 * remoto hoy) ni disparar el pipeline completo. El escenario CI7 se prueba así deliberadamente en
 * vez de invocar `npm run ci`/`npm run ci:hook` de verdad desde este test: ambos ejecutan `npm
 * test`, que volvería a correr este mismo archivo de test — invocarlos aquí crearía una recursión
 * sin salida (un "fork bomb" de procesos `npm`), así que se verifica el mismo hecho observable (los
 * pasos que necesitan contenedores están *después* de `ci:hook` en la definición, y `&&` corta en
 * el primer fallo) leyendo la definición en vez de ejecutarla.
 */
const packageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { readonly scripts: Readonly<Record<string, string>> };

const workflow = readFileSync(
  new URL('../../../.github/workflows/ci.yml', import.meta.url),
  'utf8',
);

describe('CI5/CI6 — el workflow de GitHub Actions invoca npm run ci sin redefinir pasos', () => {
  it('CI5 — El workflow de CI invoca la misma definición, sin duplicarla', () => {
    expect(workflow).toMatch(/run:\s*npm run ci\s*$/m);
    // Ninguno de los pasos atómicos que compone `ci` se repite como un `run:` propio del YAML.
    for (const pasoAtomico of ['npm run lint', 'npm run typecheck', 'npm run fronteras', 'npm run test:e2e']) {
      expect(workflow).not.toContain(`run: ${pasoAtomico}`);
    }
  });

  it('CI6 — El workflow ejecuta la secuencia completa en cada push y PR', () => {
    expect(workflow).toMatch(/^on:/m);
    expect(workflow).toContain('push:');
    expect(workflow).toContain('pull_request:');
  });

  it('usa fetch-depth: 0 (lo necesitan "commits" y "contrato:diff" para comparar contra main)', () => {
    expect(workflow).toContain('fetch-depth: 0');
  });
});

describe('CI7 — el orden de npm run ci preserva la pirámide de tests', () => {
  it('ci:hook (que incluye los tests unitarios) corre antes que fronteras, test:cobertura y test:e2e', () => {
    const pasos = packageJson.scripts.ci.split('&&').map((paso) => paso.trim());
    const indiceCiHook = pasos.findIndex((paso) => paso === 'npm run ci:hook');
    const indiceFronteras = pasos.findIndex((paso) => paso === 'npm run fronteras');
    const indiceCobertura = pasos.findIndex((paso) => paso === 'npm run test:cobertura');
    const indiceE2e = pasos.findIndex((paso) => paso === 'npm run test:e2e');

    expect(indiceCiHook).toBeGreaterThanOrEqual(0);
    expect(indiceFronteras).toBeGreaterThan(indiceCiHook);
    expect(indiceCobertura).toBeGreaterThan(indiceCiHook);
    expect(indiceE2e).toBeGreaterThan(indiceCobertura);
    // ci:hook en sí mismo corre los tests unitarios (npm test) antes de cualquier otra cosa; un
    // fallo ahí corta la cadena `&&` sin llegar jamás a test:cobertura/test:e2e (Testcontainers).
    const pasosDeCiHook = packageJson.scripts['ci:hook'].split('&&').map((paso) => paso.trim());
    expect(pasosDeCiHook).toContain('npm test');
    expect(pasosDeCiHook.indexOf('npm test')).toBeLessThan(pasosDeCiHook.length - 1);
  });
});
