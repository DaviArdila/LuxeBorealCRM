import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

/**
 * D10/CLT9 de la Fase 11b: las fronteras del cliente las hace cumplir el lint del propio cliente
 * (`cliente/eslint.config.js`). Cada regla se prueba con código que la viola, sobre rutas reales de
 * `cliente/src/app/`: el archivo no tiene que existir, pero lo que importa sí (el resolvedor lo
 * busca en disco). Corre con `npm run test:herramientas` del cliente (ADR-0023).
 */
const cliente = path.resolve(import.meta.dirname, '..');
const hayLint = existsSync(path.join(cliente, 'node_modules', 'eslint-plugin-boundaries'));

/**
 * Corre el ESLint del cliente como un proceso con su propio directorio de trabajo: el plugin de
 * fronteras resuelve las rutas de `boundaries/include` contra `process.cwd()`, así que la clase
 * `ESLint` dentro de Vitest no vería ningún archivo si su cwd fuera otro.
 */
async function reglasQueFallan(codigo: string, archivo: string): Promise<string[]> {
  const bin = path.join(cliente, 'node_modules', 'eslint', 'bin', 'eslint.js');
  const ruta = path.join(cliente, 'src', 'app', archivo);
  const salida = await new Promise<string>((resolver, rechazar) => {
    const proceso = spawn(process.execPath, [bin, '--stdin', '--stdin-filename', ruta, '--format', 'json'], {
      cwd: cliente,
    });
    let texto = '';
    let errores = '';
    proceso.stdout.on('data', (trozo: Buffer) => (texto += trozo.toString()));
    proceso.stderr.on('data', (trozo: Buffer) => (errores += trozo.toString()));
    proceso.on('error', rechazar);
    // ESLint sale con 1 cuando hay errores de lint: es lo esperado; solo 2 es una falla de ejecución.
    proceso.on('close', (codigoSalida) =>
      codigoSalida === 2 ? rechazar(new Error(errores)) : resolver(texto),
    );
    proceso.stdin.end(codigo);
  });
  const [resultado] = JSON.parse(salida) as { messages: { ruleId: string | null }[] }[];
  return resultado.messages.map((mensaje) => mensaje.ruleId).filter((id): id is string => id !== null);
}

describe.skipIf(!hayLint)('CLT9 — Las fronteras del cliente fallan en el lint', () => {
  describe('imports prohibidos', () => {
    it.each([
      ['un área importa otra área', 'areas/inventario/inventario.ts', "import { AREA_ASISTENTE } from '../asistente/area';\nexport const x = AREA_ASISTENTE;\n"],
      ['nucleo importa un área', 'nucleo/malo.ts', "import { AREA_ASISTENTE } from '../areas/asistente/area';\nexport const x = AREA_ASISTENTE;\n"],
      ['compartido importa nucleo', 'compartido/malo.ts', "import type { Rol } from '../nucleo/definicion-area';\nexport type X = Rol;\n"],
      ['el shell importa un área', 'shell/malo.ts', "import { AREA_ASISTENTE } from '../areas/asistente/area';\nexport const x = AREA_ASISTENTE;\n"],
      ['un área importa el registro', 'areas/asistente/malo.ts', "import { REGISTRO_DE_AREAS } from '../registro/registro';\nexport const x = REGISTRO_DE_AREAS;\n"],
    ])('%s', async (_nombre, archivo, codigo) => {
      expect(await reglasQueFallan(codigo, archivo)).toContain('boundaries/dependencies');
    });

    it('CLT1 — cualquier archivo que importa código del servidor falla', async () => {
      const codigo = "import { AppModule } from '../../../src/app.module';\nexport const x = AppModule;\n";

      expect(await reglasQueFallan(codigo, 'nucleo/servidor.ts')).toContain('no-restricted-imports');
    });

    it('CLT1 — importar desde la carpeta servicio/ (ADR-0023) también falla', async () => {
      const codigo =
        "import { AppModule } from '../../../../servicio/src/app.module';\nexport const x = AppModule;\n";

      expect(await reglasQueFallan(codigo, 'nucleo/servidor.ts')).toContain('no-restricted-imports');
    });
  });

  describe('imports permitidos', () => {
    it.each([
      ['un área usa nucleo y su propia carpeta', 'areas/asistente/bueno.ts', "import type { DefinicionArea } from '../../nucleo/definicion-area';\nimport { AREA_ASISTENTE } from './area';\nexport const x: DefinicionArea = AREA_ASISTENTE;\n"],
      ['el registro importa las áreas', 'areas/registro/bueno.ts', "import { AREA_ASISTENTE } from '../asistente/area';\nexport const x = AREA_ASISTENTE;\n"],
      ['el shell usa el registro', 'shell/bueno.ts', "import { REGISTRO_DE_AREAS } from '../areas/registro/registro';\nexport const x = REGISTRO_DE_AREAS;\n"],
      ['nucleo usa el cliente generado', 'nucleo/bueno.ts', "import type { obtenerSesionActual } from '../api/fn/auth/obtener-sesion-actual';\nexport type X = typeof obtenerSesionActual;\n"],
    ])('%s', async (_nombre, archivo, codigo) => {
      const reglas = await reglasQueFallan(codigo, archivo);

      expect(reglas).not.toContain('boundaries/dependencies');
      expect(reglas).not.toContain('no-restricted-imports');
    });
  });
});
