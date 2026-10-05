import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generarApi, verificarDerivaApi } from './api.mjs';

/**
 * CLT2: el cliente HTTP de `src/app/api/` se genera desde el contrato público (`../openapi/openapi.json`)
 * y nunca se edita a mano. La generación y la deriva son del propio cliente (ADR-0023): `npm run
 * api:generar` y `npm run api:deriva`, con el `ng-openapi-gen` de sus dependencias.
 */
const cliente = path.resolve(import.meta.dirname, '..');
const contratoPublico = path.resolve(cliente, '..', 'openapi', 'openapi.json');
const hayGenerador = existsSync(path.join(cliente, 'node_modules', 'ng-openapi-gen'));

describe.skipIf(!hayGenerador)('CLT2 — api:deriva compara el cliente generado con el contrato', () => {
  it('CLT2 — El cliente commiteado coincide con el contrato público', async () => {
    const resultado = await verificarDerivaApi();

    expect(resultado.limpio).toBe(true);
    expect(resultado.mensaje).toContain('coincide byte a byte');
  });

  it('CLT2 — Un contrato alterado sin regenerar el cliente hace fallar la verificación y nombra el archivo', async () => {
    const original = JSON.parse(await readFile(contratoPublico, 'utf8')) as {
      paths: Record<string, Record<string, { operationId?: string }>>;
    };
    original.paths['/api/v1/auth/yo']['get'].operationId = 'quienSoy';
    const carpeta = await mkdtemp(path.join(tmpdir(), 'luxe-contrato-'));
    const alterado = path.join(carpeta, 'openapi.json');
    try {
      await writeFile(alterado, JSON.stringify(original), 'utf8');

      const resultado = await verificarDerivaApi({ contrato: alterado });

      expect(resultado.limpio).toBe(false);
      expect(resultado.mensaje).toContain('obtener-sesion-actual.ts');
      expect(resultado.mensaje).toContain('npm run api:generar');
    } finally {
      await rm(carpeta, { recursive: true, force: true });
    }
  });

  it('CLT2 — generarApi deja el árbol igual cuando el contrato no cambió', async () => {
    const resultado = await generarApi();

    expect(resultado.limpio).toBe(true);
    expect((await verificarDerivaApi()).limpio).toBe(true);
  });

  it('CLT2 — generarApi escribe con LF aunque el sistema use CRLF (portable a Windows)', async () => {
    await generarApi();

    const carpeta = path.join(cliente, 'src', 'app', 'api');
    const archivos = await readdir(carpeta, { recursive: true, withFileTypes: true });
    const conCrlf: string[] = [];
    for (const archivo of archivos.filter((entrada) => entrada.isFile())) {
      const contenido = await readFile(path.join(archivo.parentPath, archivo.name), 'utf8');
      if (contenido.includes('\r')) conCrlf.push(archivo.name);
    }

    expect(conCrlf).toEqual([]);
  });
});

describe('CLT2 — sin las dependencias del cliente se explica cómo instalarlas', () => {
  it('CLT2 — Con una carpeta de cliente sin node_modules, la deriva falla con la instrucción', async () => {
    const carpeta = await mkdtemp(path.join(tmpdir(), 'luxe-cliente-vacio-'));
    try {
      const resultado = await verificarDerivaApi({ raizCliente: carpeta });

      expect(resultado.limpio).toBe(false);
      expect(resultado.mensaje).toContain('npm --prefix cliente ci');
    } finally {
      await rm(carpeta, { recursive: true, force: true });
    }
  });
});

describe('CLT2 — los scripts del cliente apuntan a esta herramienta', () => {
  it('CLT2 — api:generar y api:deriva corren herramientas/api.mjs', async () => {
    const paquete = JSON.parse(await readFile(path.join(cliente, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(paquete.scripts['api:generar']).toBe('node herramientas/api.mjs generar');
    expect(paquete.scripts['api:deriva']).toBe('node herramientas/api.mjs deriva');
  });
});
