import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { readonly scripts: Readonly<Record<string, string>> };

// En Windows, `npm` se resuelve a `npm.cmd`, y Node no puede lanzar un `.cmd` directamente sin
// `shell: true` (limitación documentada de `child_process` en Windows, no de este proyecto:
// devuelve `EINVAL` incluso apuntando al binario exacto). A diferencia de `ejecutarHerramienta`
// (matriz de amenazas de `tasks.md`, que evita `shell: true` porque compone rutas de repositorio
// reales dentro del comando), aquí el comando es literal (`npm run verify`) y el único argumento
// variable es `cwd`, nunca texto interpolado en la línea de comando — sin superficie de inyección.
const opcionesNpm = { shell: process.platform === 'win32' } as const;

describe('PLT7 — npm run verify como puerta de verificación local', () => {
  it('PLT7 — gitleaks, commitlint y npm audit no forman parte de npm run verify', () => {
    expect(packageJson.scripts.verify).toContain('npm run contrato:deriva');
    expect(packageJson.scripts.verify).not.toMatch(/npm run (secretos|commits|auditoria)\b/);
  });

  it('agrega la deriva al subconjunto rápido del hook', () => {
    expect(packageJson.scripts['ci:hook']).toContain('npm run contrato:deriva');
  });

  it('ejecuta dependency-cruiser sobre src y scripts', () => {
    expect(packageJson.scripts.fronteras).toContain('src scripts');
  });
});

/**
 * Los dos escenarios de abajo no invocan `npm run verify` de la raíz real de este repositorio: ese
 * comando corre `vitest run --project unit --project integracion`, que volvería a ejecutar este
 * mismo archivo — la misma recursión sin salida que ya documentan `workflow-ci.spec.ts` (CI7) y
 * `hook-pre-push.spec.ts` (CI1). En su lugar, el segundo test reproduce el número y el orden
 * reales de pasos de `verify` (leídos de `package.json` arriba) en un `package.json` aislado, con
 * cada paso sustituido por un stub controlable que solo deja un archivo marcador — la ejecución de
 * `npm run verify` en ese directorio temporal es real, solo que sobre pasos simulados.
 */
describe('PLT7 — composición y comportamiento de npm run verify', () => {
  const pasosVerify = packageJson.scripts.verify.split('&&').map((paso) => paso.trim());
  const pasoTests = pasosVerify.find((paso) => paso.startsWith('vitest run'));

  it('PLT7 — npm run verify en verde ejecuta las seis comprobaciones', () => {
    // La sexta comprobación (unitarios + integración) vive en un solo comando vitest con dos
    // --project; lint, typecheck, fronteras y contrato:deriva son comandos npm run propios —
    // cinco pasos && que cubren las seis comprobaciones que exige PLT7.
    expect(pasosVerify).toContain('npm run lint');
    expect(pasosVerify).toContain('npm run typecheck');
    expect(pasosVerify).toContain('npm run fronteras');
    expect(pasosVerify).toContain('npm run contrato:deriva');
    expect(pasoTests).toBeDefined();
    expect(pasoTests).toContain('--project unit');
    expect(pasoTests).toContain('--project integracion');

    const indiceLint = pasosVerify.indexOf('npm run lint');
    const indiceTypecheck = pasosVerify.indexOf('npm run typecheck');
    const indiceFronteras = pasosVerify.indexOf('npm run fronteras');
    const indiceDeriva = pasosVerify.indexOf('npm run contrato:deriva');
    const indiceTests = pasosVerify.indexOf(pasoTests as string);
    expect(indiceTypecheck).toBeGreaterThan(indiceLint);
    expect(indiceFronteras).toBeGreaterThan(indiceTypecheck);
    expect(indiceDeriva).toBeGreaterThan(indiceFronteras);
    expect(indiceTests).toBeGreaterThan(indiceDeriva);
    // Los pasos están unidos por && (nunca ; ni ||): un fallo en cualquiera corta la cadena — la
    // propiedad exacta que ejercita, con un push real, el siguiente escenario.
    expect(packageJson.scripts.verify).not.toMatch(/;\s*npm/);
    expect(packageJson.scripts.verify).not.toMatch(/\|\|/);
  });

  it(
    'PLT7 — Un fallo en cualquier comprobación hace fallar npm run verify',
    () => {
      const origen = mkdtemp(path.join(tmpdir(), 'luxe-verify-simulado-'));
      return origen.then(async (raiz) => {
        try {
          const indiceQueFalla = Math.floor(pasosVerify.length / 2);
          const scripts: Record<string, string> = {};
          pasosVerify.forEach((_paso, indice) => {
            scripts[`paso-${indice}`] =
              indice === indiceQueFalla
                ? 'node -e "process.exit(1)"'
                : `node -e "require('node:fs').writeFileSync('paso-${indice}.marcador','')"`;
          });
          scripts.verify = pasosVerify.map((_paso, indice) => `npm run paso-${indice}`).join(' && ');
          await writeFile(
            path.join(raiz, 'package.json'),
            JSON.stringify({ name: 'luxe-verify-simulado', private: true, scripts }, null, 2),
            'utf8',
          );

          const resultado = spawnSync('npm', ['run', 'verify'], {
            cwd: raiz,
            encoding: 'utf8',
            ...opcionesNpm,
          });

          expect(resultado.status).not.toBe(0);
          for (let indice = 0; indice < indiceQueFalla; indice += 1) {
            expect(existsSync(path.join(raiz, `paso-${indice}.marcador`))).toBe(true);
          }
          for (let indice = indiceQueFalla; indice < pasosVerify.length; indice += 1) {
            expect(existsSync(path.join(raiz, `paso-${indice}.marcador`))).toBe(false);
          }
        } finally {
          await rm(raiz, { recursive: true, force: true });
        }
      });
    },
    // 90 s, no 30 s: mismo motivo que hook-pre-push.spec.ts — varios npm run anidados reales,
    // lentos bajo la contención de Docker que ya documentaron T6/T7.
    90_000,
  );
});
