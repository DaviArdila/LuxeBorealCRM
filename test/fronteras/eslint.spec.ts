import { ESLint } from 'eslint';

/**
 * D10 (`openspec/changes/fase-00a-esqueleto/design.md`): las reglas "Reloj", "Entorno" y
 * "Consola" de `eslint.config.js`. Usa `ESLint.lintText(codigo, { filePath })` con `filePath`
 * apuntando a archivos reales del repo — el contenido real en disco es irrelevante, `lintText`
 * lintea el `codigo` recibido como parámetro — porque `parserOptions.projectService` de
 * `typescript-eslint` (activado por `recommendedTypeChecked`) rechaza rutas que no formen parte
 * de ningún proyecto de TypeScript: un `filePath` inventado falla con "was not found by the
 * project service" antes de evaluar ninguna regla.
 */

type Mensaje = ESLint.LintResult['messages'][number];

const eslint = new ESLint({});

async function lint(codigo: string, archivo: string): Promise<Mensaje[]> {
  const [resultado] = await eslint.lintText(codigo, { filePath: archivo });
  return resultado.messages;
}

function idsDe(mensajes: Mensaje[]): string[] {
  return mensajes.map((mensaje) => mensaje.ruleId).filter((id): id is string => id !== null);
}

describe('fronteras — eslint (D10)', () => {
  describe('Reloj', () => {
    const codigoConReloj = [
      'export function leer(): number {',
      '  return Date.now();',
      '}',
      '',
      'export function crear(): Date {',
      '  return new Date();',
      '}',
      '',
      'export function crearTexto(): string {',
      '  return Date();',
      '}',
      '',
      'export function leerTemporal(): unknown {',
      '  return Temporal.Now.instant();',
      '}',
    ].join('\n');

    it('Date.now() y new Date() sin argumentos violan la regla fuera de plataforma/reloj', async () => {
      const ids = idsDe(await lint(codigoConReloj, 'src/main.ts'));

      expect(ids).toContain('no-restricted-syntax');
      // 120 s (era 15 s, luego 45 s): la primera llamada a ESLint en este archivo crea el
      // `projectService` de typescript-eslint (TypeScript real, no incremental todavía). Bajo
      // `npm run test:cobertura` dentro de `npm run ci` completo (T7, medido en la máquina de
      // desarrollo real) compite a la vez con: instrumentación de cobertura v8 sobre los proyectos
      // `unit` + `integracion`, los contenedores de Testcontainers de `integracion`, y hasta tres
      // archivos de test que lanzan contenedores Docker reales en paralelo (gitleaks de T1,
      // oasdiff de T5, actionlint de T6) — 45 s no bastó en esa combinación (observado real: FAIL
      // por timeout corriendo `npm run ci` de punta a punta antes de subir a 120 s). Vitest
      // paraleliza archivos de test independientes por diseño (más rápido en el caso común); no se
      // desactivó esa paralelización solo para este caso extremo (D8 no la pide para `ci`, y
      // serializar `unit`+`integracion` alargaría cada corrida normal sin necesidad) — en cambio,
      // se da a este test, específicamente lento por naturaleza (creación de un `projectService`
      // real), el margen que necesita para el peor caso medido.
    }, 120_000);

    it('Date() sin new viola la regla fuera de plataforma/reloj', async () => {
      const ids = idsDe(await lint('export const hora = Date();\n', 'src/main.ts'));

      expect(ids).toContain('no-restricted-syntax');
    });

    it('Temporal.Now viola la regla fuera de plataforma/reloj', async () => {
      const ids = idsDe(
        await lint('export const hora = Temporal.Now.instant();\n', 'src/main.ts'),
      );

      expect(ids).toContain('no-restricted-syntax');
    });

    it('new Date() con argumento está permitido', async () => {
      const ids = idsDe(await lint('export const fecha = new Date(0);\n', 'src/main.ts'));

      expect(ids).not.toContain('no-restricted-syntax');
    });

    it('la regla también aplica dentro de test/', async () => {
      const ids = idsDe(await lint(codigoConReloj, 'test/fakes/clock-falso.ts'));

      expect(ids).toContain('no-restricted-syntax');
    });

    it('no viola la regla dentro de plataforma/reloj (excepción)', async () => {
      const ids = idsDe(await lint(codigoConReloj, 'src/plataforma/reloj/clock-sistema.ts'));

      expect(ids).not.toContain('no-restricted-syntax');
    });
  });

  describe('Entorno', () => {
    const codigoConEntorno = [
      "import { env } from 'node:process';",
      '',
      'export function leer(): string | undefined {',
      '  return process.env.LUXE_ALGO ?? env.LUXE_ALGO;',
      '}',
    ].join('\n');

    it('leer process.env o importar env de process/node:process viola la regla fuera de plataforma/config', async () => {
      const ids = idsDe(await lint(codigoConEntorno, 'src/main.ts'));

      expect(ids).toEqual(
        expect.arrayContaining(['no-restricted-syntax', 'no-restricted-imports']),
      );
    });

    it('importar env desde process viola la regla fuera de plataforma/config', async () => {
      const ids = idsDe(
        await lint("import { env } from 'process';\nexport const valor = env.PORT;\n", 'src/main.ts'),
      );

      expect(ids).toContain('no-restricted-imports');
    });

    it('no viola la regla dentro de plataforma/config (excepción)', async () => {
      const ids = idsDe(await lint(codigoConEntorno, 'src/plataforma/config/esquema.ts'));

      expect(ids).not.toContain('no-restricted-syntax');
      expect(ids).not.toContain('no-restricted-imports');
    });
  });

  describe('Consola', () => {
    it('console.log() viola la regla', async () => {
      const ids = idsDe(await lint("console.log('hola');\n", 'src/main.ts'));

      expect(ids).toContain('no-console');
    });

    it('un archivo sin console.* no viola la regla', async () => {
      const ids = idsDe(await lint('export const saludo = "hola";\n', 'src/main.ts'));

      expect(ids).not.toContain('no-console');
    });

    it('console.* viola la regla también en archivos JavaScript', async () => {
      const ids = idsDe(await lint("console.error('error');\n", 'eslint.config.js'));

      expect(ids).toContain('no-console');
    });
  });
});
