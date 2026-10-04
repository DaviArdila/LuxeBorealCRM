import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { resolverRaizRepositorio } from '../../scripts/herramientas.js';

const raiz = resolverRaizRepositorio();

async function leerJson<T>(...partes: string[]): Promise<T> {
  return JSON.parse(await readFile(path.join(raiz, ...partes), 'utf8')) as T;
}

describe('CLT3 — En desarrollo el cliente y la API comparten origen', () => {
  it('CLT3 — El proxy del servidor de desarrollo reenvía /api al puerto de la API', async () => {
    const proxy = await leerJson<Record<string, { target: string; changeOrigin: boolean }>>('cliente', 'proxy.conf.json');
    const env = await readFile(path.join(raiz, '.env.example'), 'utf8');
    const puerto = /^PORT=(\d+)$/m.exec(env)?.[1];

    expect(Object.keys(proxy)).toEqual(['/api']);
    expect(proxy['/api'].target).toBe(`http://localhost:${puerto}`);
    // La cookie SameSite=Strict exige que el navegador vea un solo origen: el proxy no cambia el Host.
    expect(proxy['/api'].changeOrigin).toBe(false);
  });

  it('CLT3 — npm start del cliente usa ese proxy', async () => {
    const paquete = await leerJson<{ scripts: Record<string, string> }>('cliente', 'package.json');

    expect(paquete.scripts['start']).toContain('--proxy-config proxy.conf.json');
  });

  it('CLT3 — El cliente no llama a otro origen: la configuración de la API usa rutas relativas', async () => {
    const config = await readFile(path.join(raiz, 'cliente', 'src', 'app', 'nucleo', 'configuracion-api.ts'), 'utf8');

    expect(config).toContain("provideApiConfiguration('')");
  });
});
