import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

// T8 (fase-07b): los prompts .md viajan al build y el cargador los encuentra desde `dist/` (AGT13, D8).

const RAIZ = path.resolve(import.meta.dirname, '..', '..', '..');

describe('Prompts versionados en el build (T8, D8)', () => {
  it('npm run build deja los .md en dist/ y el cargador compilado los lee', async () => {
    // El CLI de Nest con `node` directamente: `npx` en Windows es `npx.cmd` y `execFileSync` sin shell
    // no lo encuentra (ENOENT).
    const cliNest = path.join(RAIZ, 'node_modules', '@nestjs', 'cli', 'bin', 'nest.js');
    execFileSync(process.execPath, [cliNest, 'build'], { cwd: RAIZ, stdio: 'pipe' });

    const carpeta = path.join(RAIZ, 'dist', 'modulos', 'agente', 'prompts');
    expect(existsSync(path.join(carpeta, 'seguridad.v1.md'))).toBe(true);
    expect(existsSync(path.join(carpeta, 'estilo.v4.md'))).toBe(true);
    expect(existsSync(path.join(carpeta, 'turno.v3.md'))).toBe(true);

    const modulo = (await import(
      pathToFileURL(path.join(RAIZ, 'dist', 'modulos', 'agente', 'infraestructura', 'prompts', 'cargador-prompts.js')).href
    )) as { CargadorPrompts: new () => { onModuleInit(): void; seguridad: string; estilo: string; turno: string; version: string } };
    const cargador = new modulo.CargadorPrompts();
    cargador.onModuleInit();

    expect(cargador.seguridad.length).toBeGreaterThan(100);
    expect(cargador.estilo.length).toBeGreaterThan(20);
    expect(cargador.turno).toContain('{{instrucciones}}');
    expect(cargador.version).toBe('v5');
  }, 180_000);
});
