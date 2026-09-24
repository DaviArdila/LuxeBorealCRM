import { execFileSync } from 'node:child_process';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buscarSecretosEnArbol } from '../../scripts/buscar-secretos.js';

/**
 * `scripts/buscar-secretos.ts` (CI3, D8, D10). Se ejercita contra un repositorio git aislado y
 * real en un directorio temporal — nunca contra el repositorio de este proyecto — para no dejar
 * secretos de prueba en el árbol de trabajo real ni depender de limpiar el historial de git.
 * Requiere Docker corriendo (ADR-0009: "Docker MUST estar corriendo para probar").
 */
async function crearRepositorioDePrueba(): Promise<string> {
  const raiz = await mkdtemp(path.join(tmpdir(), 'luxe-secretos-prueba-'));
  execFileSync('git', ['init', '--quiet'], { cwd: raiz });
  execFileSync('git', ['config', 'user.email', 'prueba@luxeboreal.test'], { cwd: raiz });
  execFileSync('git', ['config', 'user.name', 'Prueba'], { cwd: raiz });
  return raiz;
}

describe('scripts/buscar-secretos — buscarSecretosEnArbol', () => {
  it(
    'CI3 — Un secreto detectado bloquea el push: un secreto en el árbol de trabajo se reporta',
    async () => {
      const raiz = await crearRepositorioDePrueba();
      try {
        await writeFile(
          path.join(raiz, 'archivo-con-secreto.js'),
          [
            '// clave de prueba, no real',
            'const clave = "-----BEGIN RSA PRIVATE KEY-----\\n' +
              'MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu\\n' +
              '-----END RSA PRIVATE KEY-----";',
            'export default clave;',
            '',
          ].join('\n'),
          'utf8',
        );

        const resultado = await buscarSecretosEnArbol(raiz);

        expect(resultado.limpio).toBe(false);
        expect(resultado.mensaje).toContain('archivo-con-secreto.js');
        // Nunca el secreto completo en la salida (CI3).
        expect(resultado.mensaje).not.toContain('MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9C');
      } finally {
        await rm(raiz, { recursive: true, force: true });
      }
    },
    30_000,
  );

  it(
    'CI3 — Un falso positivo se resuelve con allowlist versionada: no se reporta si está en .gitleaks.toml',
    async () => {
      const raiz = await crearRepositorioDePrueba();
      try {
        await writeFile(
          path.join(raiz, 'archivo-con-secreto.js'),
          [
            '// clave de prueba, no real; falso positivo confirmado y documentado',
            'const clave = "-----BEGIN RSA PRIVATE KEY-----\\n' +
              'MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu\\n' +
              '-----END RSA PRIVATE KEY-----";',
            'export default clave;',
            '',
          ].join('\n'),
          'utf8',
        );
        await writeFile(
          path.join(raiz, '.gitleaks.toml'),
          [
            'title = "allowlist de prueba"',
            '[extend]',
            'useDefault = true',
            '[allowlist]',
            'description = "falso positivo confirmado en el test de buscar-secretos"',
            "paths = ['''archivo-con-secreto\\.js''']",
            '',
          ].join('\n'),
          'utf8',
        );

        const resultado = await buscarSecretosEnArbol(raiz);

        expect(resultado.limpio).toBe(true);
      } finally {
        await rm(raiz, { recursive: true, force: true });
      }
    },
    30_000,
  );

  it(
    'un árbol sin secretos termina en verde',
    async () => {
      const raiz = await crearRepositorioDePrueba();
      try {
        await writeFile(path.join(raiz, 'inocuo.txt'), 'nada que ver aquí\n', 'utf8');

        const resultado = await buscarSecretosEnArbol(raiz);

        expect(resultado.limpio).toBe(true);
        expect(resultado.mensaje).toContain('sin secretos');
      } finally {
        await rm(raiz, { recursive: true, force: true });
      }
    },
    30_000,
  );
});
