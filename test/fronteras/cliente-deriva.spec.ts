import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generarCliente, verificarDerivaCliente } from '../../scripts/generar-cliente.js';
import { resolverRaizRepositorio } from '../../scripts/herramientas.js';

const raiz = resolverRaizRepositorio();
// El generador vive en las dependencias del cliente (`npm --prefix cliente ci`); sin ellas no hay
// nada que ejercitar, y `cliente:ci` (T9) corre este archivo con ellas instaladas.
const hayGenerador = existsSync(path.join(raiz, 'cliente', 'node_modules', 'ng-openapi-gen'));

describe.skipIf(!hayGenerador)('CLT2 — cliente:deriva compara el cliente generado con el contrato', () => {
  it('CLT2 — El cliente commiteado coincide con el contrato público', async () => {
    const resultado = await verificarDerivaCliente();

    expect(resultado.limpio).toBe(true);
    expect(resultado.mensaje).toContain('coincide byte a byte');
  });

  it('CLT2 — Un contrato alterado sin regenerar el cliente hace fallar la verificación y nombra el archivo', async () => {
    const original = JSON.parse(await readFile(path.join(raiz, 'openapi', 'openapi.json'), 'utf8')) as {
      paths: Record<string, Record<string, { operationId?: string }>>;
    };
    original.paths['/api/v1/auth/yo']['get'].operationId = 'quienSoy';
    const carpeta = await mkdtemp(path.join(tmpdir(), 'luxe-contrato-'));
    const alterado = path.join(carpeta, 'openapi.json');
    try {
      await writeFile(alterado, JSON.stringify(original), 'utf8');

      const resultado = await verificarDerivaCliente({ contrato: alterado });

      expect(resultado.limpio).toBe(false);
      expect(resultado.mensaje).toContain('obtener-sesion-actual.ts');
      expect(resultado.mensaje).toContain('npm run cliente:generar');
    } finally {
      await rm(carpeta, { recursive: true, force: true });
    }
  });

  it('CLT2 — generarCliente deja el árbol igual cuando el contrato no cambió', async () => {
    const resultado = await generarCliente();

    expect(resultado.limpio).toBe(true);
    expect((await verificarDerivaCliente()).limpio).toBe(true);
  });

  it('CLT2 — generarCliente escribe con LF aunque el sistema use CRLF (portable a Windows)', async () => {
    await generarCliente();

    const carpeta = path.join(raiz, 'cliente', 'src', 'app', 'api');
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
  it('CLT2 — Con una raíz sin cliente/node_modules, la deriva falla con la instrucción', async () => {
    const carpeta = await mkdtemp(path.join(tmpdir(), 'luxe-raiz-'));
    try {
      const resultado = await verificarDerivaCliente({ raiz: carpeta });

      expect(resultado.limpio).toBe(false);
      expect(resultado.mensaje).toContain('npm --prefix cliente ci');
    } finally {
      await rm(carpeta, { recursive: true, force: true });
    }
  });
});
