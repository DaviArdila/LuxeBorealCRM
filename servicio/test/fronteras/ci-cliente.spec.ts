import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { resolverRaizRepositorio, resolverRaizServicio } from '../../scripts/herramientas.js';

const raiz = resolverRaizRepositorio();
const raizServicio = resolverRaizServicio();

async function scripts(): Promise<Record<string, string>> {
  const paquete = JSON.parse(await readFile(path.join(raizServicio, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  return paquete.scripts;
}

describe('CI10 — La secuencia de CI incluye el cliente de back office', () => {
  it('CI10 — npm run ci termina con cliente:ci, encadenado con && para que un fallo lo detenga', async () => {
    const { ci } = await scripts();

    expect(ci.endsWith(' && npm run cliente:ci')).toBe(true);
    expect(ci).not.toMatch(/;|\|\|/);
  });

  it('CI10 — cliente:ci instala, lint, tests, build, auditoría y deriva, en ese orden y con &&', async () => {
    const { 'cliente:ci': clienteCi } = await scripts();

    const pasos = clienteCi.split(' && ');
    expect(pasos.slice(0, 5)).toEqual([
      'npm --prefix ../cliente ci',
      'npm --prefix ../cliente run lint',
      'npm --prefix ../cliente test',
      'npm --prefix ../cliente run build',
      'npm run auditoria:cliente',
    ]);
    expect(pasos).toContain('npm run cliente:deriva');
    // Las pruebas de la raíz que necesitan las dependencias del cliente corren ya con ellas instaladas.
    expect(clienteCi).toContain('test/fronteras/cliente-fronteras.spec.ts');
    expect(clienteCi).toContain('test/fronteras/cliente-deriva.spec.ts');
  });

  it('CI10 — El hook pre-push (ci:hook) no incluye nada del cliente', async () => {
    const { 'ci:hook': hook } = await scripts();

    expect(hook).not.toContain('cliente');
  });

  it('CI10 — npm run fronteras sigue cruzando solo src y scripts', async () => {
    const { fronteras } = await scripts();

    expect(fronteras).toBe('depcruise src scripts --config .dependency-cruiser.cjs');
  });

  it('CI10 — El workflow sigue invocando solo npm run ci y cachea las dependencias del cliente', async () => {
    const flujo = await readFile(path.join(raiz, '.github', 'workflows', 'ci.yml'), 'utf8');

    const comandos = [...flujo.matchAll(/^\s+run:\s*(.+)$/gm)].map((coincidencia) => coincidencia[1]);
    expect(comandos).toEqual(['npm ci', 'npm run ci']);
    // Ambos pasos corren dentro de la carpeta del servicio (ADR-0023).
    expect([...flujo.matchAll(/^\s+working-directory:\s*(.+)$/gm)].map((c) => c[1])).toEqual([
      'servicio',
      'servicio',
    ]);
    expect(flujo).toContain('servicio/package-lock.json');
    expect(flujo).toContain('cliente/package-lock.json');
  });
});
