import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { resolverRaizRepositorio, resolverRaizServicio } from '../../scripts/herramientas.js';

/**
 * CI10 con la estructura de ADR-0023: el repositorio tiene dos aplicaciones hermanas (`servicio/` y
 * `cliente/`), cada una con su propio `ci`, y una raíz sin dependencias que las encadena. Pruebas de
 * contenido, como `workflow-ci.spec.ts`: ejecutar `npm run ci` desde aquí sería recursivo.
 */
const raiz = resolverRaizRepositorio();

interface Paquete {
  readonly scripts: Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

async function paquete(...partes: string[]): Promise<Paquete> {
  return JSON.parse(await readFile(path.join(raiz, ...partes, 'package.json'), 'utf8')) as Paquete;
}

const pasos = (comando: string): string[] => comando.split(' && ');

describe('CI10 — La raíz encadena las dos aplicaciones sin dependencias propias', () => {
  it('CI10 — package.json de la raíz no declara dependencias', async () => {
    const raizPaquete = await paquete();

    expect(raizPaquete.dependencies ?? {}).toEqual({});
    expect(raizPaquete.devDependencies ?? {}).toEqual({});
  });

  it('CI10 — npm run ci corre el ci del servicio, el del cliente y la auditoría del cliente, con &&', async () => {
    const { scripts } = await paquete();

    expect(pasos(scripts['ci'])).toEqual([
      'npm --prefix servicio run ci',
      'npm --prefix cliente run ci',
      'npm run auditoria:cliente',
    ]);
    expect(scripts['ci']).not.toMatch(/;|\|\|/);
    // La auditoría del cliente usa la herramienta del repositorio con las excepciones del cliente.
    expect(scripts['auditoria:cliente']).toBe('npm --prefix servicio run auditoria -- --directorio cliente');
  });

  it('CI10 — instalar instala cada aplicación desde su propio lockfile, sin modificarlo', async () => {
    const { scripts } = await paquete();

    // `npm ci` y no `npm install`: instalar nunca debe dejar cambios en archivos versionados.
    expect(pasos(scripts['instalar'])).toEqual(['npm --prefix servicio ci', 'npm --prefix cliente ci']);
    expect(scripts['instalar:ci']).toBeUndefined();
  });

  it('CI10 — El workflow instala y corre la secuencia de la raíz, y cachea los dos lockfiles', async () => {
    const flujo = await readFile(path.join(raiz, '.github', 'workflows', 'ci.yml'), 'utf8');

    const comandos = [...flujo.matchAll(/^\s+run:\s*(.+)$/gm)].map((coincidencia) => coincidencia[1]);
    expect(comandos).toEqual(['npm run instalar', 'npm run ci']);
    expect(flujo).not.toContain('working-directory');
    expect(flujo).toContain('servicio/package-lock.json');
    expect(flujo).toContain('cliente/package-lock.json');
  });
});

describe('CI10 — Cada aplicación se verifica sola', () => {
  it('CI10 — Ningún script del servicio menciona al cliente', async () => {
    const { scripts } = await paquete('servicio');

    const conCliente = Object.entries(scripts).filter(([nombre, comando]) =>
      /cliente/.test(`${nombre} ${comando}`),
    );
    expect(conCliente).toEqual([]);
  });

  it('CI10 — El hook pre-push (ci:hook) sigue siendo solo del servicio', async () => {
    const { scripts } = await paquete('servicio');

    expect(scripts['ci:hook']).not.toContain('cliente');
  });

  it('CI10 — npm run fronteras sigue cruzando solo src y scripts del servicio', async () => {
    const { scripts } = await paquete('servicio');

    expect(scripts['fronteras']).toBe('depcruise src scripts --config .dependency-cruiser.cjs');
  });

  it('CI10 — El ci del cliente corre lint, tests, pruebas de herramientas, build y deriva de su API', async () => {
    const { scripts } = await paquete('cliente');

    expect(pasos(scripts['ci'])).toEqual([
      'npm run lint',
      'npm test',
      'npm run test:herramientas',
      'npm run build',
      'npm run api:deriva',
    ]);
  });

  it('CI10 — El servicio sigue teniendo su propia secuencia, sin pasos del cliente', async () => {
    const servicio = await paquete('servicio');

    expect(path.basename(resolverRaizServicio())).toBe('servicio');
    expect(servicio.scripts['ci']).not.toContain('cliente');
  });
});
