import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compararContrato, MENSAJE_SIN_BASE } from '../../scripts/comparar-contrato.js';
import type { ResultadoHerramienta } from '../../scripts/herramientas.js';

/**
 * `scripts/comparar-contrato.ts` (CI9, API10, D11). Cuatro ramas de la política "sin base de
 * comparación": con base, sin base, sin rama `main`/`git show` falla, y Docker no responde. Se
 * ejercita contra repositorios git aislados y reales — nunca contra este repositorio — para poder
 * controlar si `main` existe y si tiene `openapi/openapi.json` commiteado.
 */
async function crearRepositorioDePrueba(): Promise<string> {
  const raiz = await mkdtemp(path.join(tmpdir(), 'luxe-oasdiff-prueba-'));
  execFileSync('git', ['init', '--quiet', '--initial-branch=main'], { cwd: raiz });
  execFileSync('git', ['config', 'user.email', 'prueba@luxeboreal.test'], { cwd: raiz });
  execFileSync('git', ['config', 'user.name', 'Prueba'], { cwd: raiz });
  return raiz;
}

function commitearTodo(raiz: string, mensaje: string): void {
  execFileSync('git', ['add', '-A'], { cwd: raiz });
  execFileSync('git', ['commit', '--quiet', '-m', mensaje], { cwd: raiz });
}

const DOCUMENTO_BASE = {
  openapi: '3.1.0',
  info: { title: 'Ejemplo', version: '0.0.1' },
  paths: {
    '/api/v1/ejemplos': {
      get: {
        operationId: 'listarEjemplos',
        responses: {
          '200': {
            description: 'ok',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { id: { type: 'string' }, nombre: { type: 'string' } },
                  required: ['id', 'nombre'],
                },
              },
            },
          },
        },
      },
    },
  },
};

async function escribirDocumentoPublico(raiz: string, documento: unknown): Promise<string> {
  const directorio = path.join(raiz, 'openapi');
  await mkdir(directorio, { recursive: true });
  const ruta = path.join(directorio, 'openapi.json');
  await writeFile(ruta, JSON.stringify(documento, null, 2), 'utf8');
  return ruta;
}

describe('scripts/comparar-contrato — política "sin base" (D11)', () => {
  it(
    'CI9 — Sin documento base, el paso no falla pero deja rastro visible',
    async () => {
      const raiz = await crearRepositorioDePrueba();
      try {
        await writeFile(path.join(raiz, 'README.md'), 'sin contrato todavía\n', 'utf8');
        commitearTodo(raiz, 'chore: inicial sin contrato');
        const rutaActual = await escribirDocumentoPublico(raiz, DOCUMENTO_BASE);

        const resultado = await compararContrato(raiz, rutaActual);

        expect(resultado.limpio).toBe(true);
        expect(resultado.mensaje).toBe(MENSAJE_SIN_BASE);
        expect(resultado.mensaje).toContain('SIN BASE DE COMPARACIÓN');
        expect(resultado.mensaje.toLowerCase()).not.toContain(' ok');
        expect(resultado.mensaje).not.toContain('sin cambios incompatibles');
      } finally {
        await rm(raiz, { recursive: true, force: true });
      }
    },
    30_000,
  );

  it(
    'sin la rama main, el paso falla nombrando el comando git',
    async () => {
      const raiz = await mkdtemp(path.join(tmpdir(), 'luxe-oasdiff-sin-main-'));
      try {
        // `git init` sin --initial-branch dentro de un repo aislado y sin ningún commit todavía:
        // no existe refs/heads/main.
        execFileSync('git', ['init', '--quiet', '--initial-branch=zzz-no-main'], { cwd: raiz });
        execFileSync('git', ['config', 'user.email', 'prueba@luxeboreal.test'], { cwd: raiz });
        execFileSync('git', ['config', 'user.name', 'Prueba'], { cwd: raiz });
        execFileSync('git', ['commit', '--allow-empty', '--quiet', '-m', 'chore: inicial'], {
          cwd: raiz,
        });
        const rutaActual = await escribirDocumentoPublico(raiz, DOCUMENTO_BASE);

        const resultado = await compararContrato(raiz, rutaActual);

        expect(resultado.limpio).toBe(false);
        expect(resultado.mensaje).toContain('no se encontró ninguna referencia');
        expect(resultado.mensaje).toContain('main');
      } finally {
        await rm(raiz, { recursive: true, force: true });
      }
    },
    30_000,
  );

  it(
    'CI9 — En CI, main solo existe como refs/remotes/origin/main y el gate corre igual',
    async () => {
      // Reproduce la topología real de `actions/checkout` (D8): un runner que hace checkout de
      // una rama que no es `main` nunca crea la rama local `main`, solo el remote-tracking ref
      // `refs/remotes/origin/main`. Antes de esta corrección, `compararContrato` solo miraba
      // `refs/heads/main` y por eso el gate CI9/D11 nunca corría de verdad en CI.
      const origen = await crearRepositorioDePrueba();
      let clon = '';
      try {
        await escribirDocumentoPublico(origen, DOCUMENTO_BASE);
        commitearTodo(origen, 'feat: contrato inicial');

        clon = await mkdtemp(path.join(tmpdir(), 'luxe-oasdiff-checkout-ci-'));
        execFileSync('git', ['clone', '--quiet', origen, clon]);
        execFileSync('git', ['checkout', '--quiet', '-b', 'fase-00b-ci-contrato-api'], { cwd: clon });
        execFileSync('git', ['branch', '-D', 'main'], { cwd: clon });
        const rutaActual = await escribirDocumentoPublico(clon, DOCUMENTO_BASE);

        const resultado = await compararContrato(clon, rutaActual);

        expect(resultado.limpio).toBe(true);
        expect(resultado.mensaje).toContain('sin cambios incompatibles');
        expect(resultado.mensaje).not.toContain('no se pudo comparar');
      } finally {
        await rm(origen, { recursive: true, force: true });
        if (clon) {
          await rm(clon, { recursive: true, force: true });
        }
      }
    },
    60_000,
  );

  it(
    'Docker no responde: el paso falla nombrando el problema, sin fingir una comparación real',
    async () => {
      const raiz = await crearRepositorioDePrueba();
      try {
        await escribirDocumentoPublico(raiz, DOCUMENTO_BASE);
        commitearTodo(raiz, 'feat: contrato inicial');
        const rutaActual = await escribirDocumentoPublico(raiz, DOCUMENTO_BASE);
        const ejecutarOasdiffFalso = (): Promise<ResultadoHerramienta> =>
          Promise.reject(new Error('No se pudo ejecutar Docker (¿Docker Desktop está corriendo?): ENOENT'));

        const resultado = await compararContrato(raiz, rutaActual, {
          ejecutarOasdiff: ejecutarOasdiffFalso,
        });

        expect(resultado.limpio).toBe(false);
        expect(resultado.mensaje).toContain('Docker');
      } finally {
        await rm(raiz, { recursive: true, force: true });
      }
    },
    30_000,
  );

  it(
    'CI9 — Con documento base, la comparación es real: sin cambios incompatibles queda en verde',
    async () => {
      const raiz = await crearRepositorioDePrueba();
      try {
        await escribirDocumentoPublico(raiz, DOCUMENTO_BASE);
        commitearTodo(raiz, 'feat: contrato inicial');
        const rutaActual = await escribirDocumentoPublico(raiz, DOCUMENTO_BASE);

        const resultado = await compararContrato(raiz, rutaActual);

        expect(resultado.limpio).toBe(true);
        expect(resultado.mensaje).toContain('sin cambios incompatibles');
      } finally {
        await rm(raiz, { recursive: true, force: true });
      }
    },
    60_000,
  );

  it(
    'API10 — Cambio incompatible sin nueva versión bloquea el build',
    async () => {
      const raiz = await crearRepositorioDePrueba();
      try {
        await escribirDocumentoPublico(raiz, DOCUMENTO_BASE);
        commitearTodo(raiz, 'feat: contrato inicial');
        const documentoConCampoQuitado = structuredClone(DOCUMENTO_BASE);
        delete (
          documentoConCampoQuitado.paths['/api/v1/ejemplos'].get.responses['200'].content[
            'application/json'
          ].schema.properties as { nombre?: unknown }
        ).nombre;
        const rutaActual = await escribirDocumentoPublico(raiz, documentoConCampoQuitado);

        const resultado = await compararContrato(raiz, rutaActual);

        expect(resultado.limpio).toBe(false);
        expect(resultado.mensaje).toContain('cambios incompatibles');
      } finally {
        await rm(raiz, { recursive: true, force: true });
      }
    },
    60_000,
  );

  it(
    'API10 — Un retiro de ruta anotado en openapi/oasdiff-ignorar.txt no bloquea; sin la anotación sí',
    async () => {
      const raiz = await crearRepositorioDePrueba();
      try {
        await escribirDocumentoPublico(raiz, DOCUMENTO_BASE);
        commitearTodo(raiz, 'feat: contrato inicial');
        const rutaActual = await escribirDocumentoPublico(raiz, { ...DOCUMENTO_BASE, paths: {} });

        const sinAnotar = await compararContrato(raiz, rutaActual);
        await writeFile(
          path.join(raiz, 'openapi', 'oasdiff-ignorar.txt'),
          'GET /api/v1/ejemplos api path removed without deprecation\n',
          'utf8',
        );
        const anotado = await compararContrato(raiz, rutaActual);

        expect(sinAnotar.limpio).toBe(false);
        expect(anotado.limpio).toBe(true);
      } finally {
        await rm(raiz, { recursive: true, force: true });
      }
    },
    60_000,
  );
});
