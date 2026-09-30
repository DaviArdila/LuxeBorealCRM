import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

// T8 (fase-07b): los prompts .md viajan al build y el cargador los encuentra desde `dist/` (AGT13, D8).

const RAIZ = path.resolve(import.meta.dirname, '..', '..', '..');

describe('Prompts versionados en el build (T8, D8)', () => {
  it('npm run build deja los .md en dist/ y el cargador compilado los lee', async () => {
    execFileSync('npx', ['nest', 'build'], { cwd: RAIZ, stdio: 'pipe' });

    const carpeta = path.join(RAIZ, 'dist', 'modulos', 'agente', 'prompts');
    expect(existsSync(path.join(carpeta, 'reglas.v1.md'))).toBe(true);
    expect(existsSync(path.join(carpeta, 'turno.v1.md'))).toBe(true);

    const modulo = (await import(
      pathToFileURL(path.join(RAIZ, 'dist', 'modulos', 'agente', 'infraestructura', 'prompts', 'cargador-prompts.js')).href
    )) as { CargadorPrompts: new () => { onModuleInit(): void; reglas: string; turno: string; version: string } };
    const cargador = new modulo.CargadorPrompts();
    cargador.onModuleInit();

    expect(cargador.reglas.length).toBeGreaterThan(100);
    expect(cargador.turno).toContain('{{instrucciones}}');
    expect(cargador.version).toBe('v1');
  }, 180_000);
});
