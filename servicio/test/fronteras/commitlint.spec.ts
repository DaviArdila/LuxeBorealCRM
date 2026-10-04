import load from '@commitlint/load';
import lint from '@commitlint/lint';
import type { ParserOptions } from 'conventional-commits-parser';
import path from 'node:path';

/**
 * CI2 — Conventional Commits + regla propia `sin-atribucion-ia` (D13). Carga la configuración real
 * (`commitlint.config.js`) con `@commitlint/load` — la misma resolución que usa el CLI de
 * commitlint — y valida mensajes de ejemplo con la API programática `@commitlint/lint`, igual que
 * `eslint.spec.ts` reutiliza `eslint.config.js` en vez de reimplementar sus reglas.
 */
const raizDelRepositorio = path.join(import.meta.dirname, '..', '..');

let configuracionCacheada: ReturnType<typeof load> | undefined;

function configuracion(): ReturnType<typeof load> {
  configuracionCacheada ??= load({}, { cwd: raizDelRepositorio });
  return configuracionCacheada;
}

async function validar(mensaje: string) {
  const config = await configuracion();
  return lint(mensaje, config.rules, {
    plugins: config.plugins,
    parserOpts: config.parserPreset?.parserOpts as ParserOptions | undefined,
    ignores: config.ignores,
    defaultIgnores: config.defaultIgnores,
  });
}

describe('commitlint.config.js — CI2', () => {
  it('CI2 — Mensaje sin tipo válido rechazado', async () => {
    const resultado = await validar('arreglo cosas');

    expect(resultado.valid).toBe(false);
    expect(resultado.errors.some((error) => error.name === 'type-empty')).toBe(true);
  });

  it('CI2 — Mensaje con atribución de IA rechazado', async () => {
    const resultado = await validar(
      'feat(x): algo\n\nCo-Authored-By: Un Asistente <asistente@ejemplo.com>',
    );

    expect(resultado.valid).toBe(false);
    expect(resultado.errors.some((error) => error.name === 'sin-atribucion-ia')).toBe(true);
  });

  it('CI2 — Mensaje con atribución de IA rechazado, aunque el tipo y el resto sean válidos', async () => {
    const resultado = await validar(
      'feat(plataforma/errores): agregar filtro problem+json\n\nGenerated with Claude Code',
    );

    expect(resultado.valid).toBe(false);
    expect(resultado.errors.some((error) => error.name === 'sin-atribucion-ia')).toBe(true);
  });

  it('CI2 — Mensaje convencional válido aceptado', async () => {
    const resultado = await validar('fix(salud): corregir el indicador de Redis');

    expect(resultado.valid).toBe(true);
  });
});
