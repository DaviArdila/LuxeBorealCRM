import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { readonly scripts: Readonly<Record<string, string>> };

describe('PLT7 — npm run verify como puerta de verificación local', () => {
  it('incluye la deriva del contrato y excluye comprobaciones que dependen de git o npm audit', () => {
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
