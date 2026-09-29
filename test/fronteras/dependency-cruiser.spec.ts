import path from 'node:path';
import { cruise, type IConfiguration, type IForbiddenRuleType } from 'dependency-cruiser';
// @ts-expect-error — `.dependency-cruiser.cjs` es CommonJS sin tipos; se importa como módulo
// ESM (Node interop) para reutilizar exactamente el mismo ruleSet que corre `npm run fronteras`.
import configImportado from '../../.dependency-cruiser.cjs';

/**
 * PLT6 — "Un import prohibido hace fallar npm run verify" / "Un import permitido no afecta la
 * verificación de fronteras". Cada caso de este archivo prueba las reglas de D11
 * (`openspec/changes/fase-00a-esqueleto/design.md`) con la API `cruise` sobre un árbol de
 * fixtures que reproduce la forma de `src/` (`test/fronteras/fixtures/src/...`), reutilizando el
 * mismo `ruleSet` de `.dependency-cruiser.cjs` que corre `npm run fronteras` en verde sobre el
 * código real.
 *
 * Nota (pre-T8): `@prisma/client` todavía no está instalado (llega en T8), así que la fixture de
 * la regla 4 también dispara `sin-irresolubles` — esperado, y no relevante aquí; las aserciones
 * filtran por regla **y** por archivo de origen para no depender de ese detalle transitorio.
 */

interface Violacion {
  readonly rule: { readonly name: string };
  readonly from: string;
  readonly to: string;
}

type ConfiguracionFronteras = IConfiguration & {
  readonly forbidden: IForbiddenRuleType[];
};

const configDesconocida: unknown = configImportado;

function esConfiguracionFronteras(value: unknown): value is ConfiguracionFronteras {
  return (
    typeof value === 'object' &&
    value !== null &&
    'forbidden' in value &&
    Array.isArray(value.forbidden)
  );
}

if (!esConfiguracionFronteras(configDesconocida)) {
  throw new Error('La configuración de dependency-cruiser debe exportar sus reglas forbidden.');
}

const config = configDesconocida;
const directorioFixtures = path.join(import.meta.dirname, 'fixtures');

async function ejecutarCruiseFixtures(): Promise<Violacion[]> {
  const opciones = {
    ...(config.options ?? {}),
    baseDir: directorioFixtures,
    validate: true,
    outputType: 'json' as const,
    ruleSet: { forbidden: config.forbidden },
  };
  const resultado = await cruise(['src', 'scripts'], opciones);
  const salida = JSON.parse(resultado.output as string) as {
    summary: { violations: Violacion[] };
  };
  return salida.summary.violations;
}

let cacheViolaciones: Promise<Violacion[]> | undefined;

function violacionesDeFixtures(): Promise<Violacion[]> {
  cacheViolaciones ??= ejecutarCruiseFixtures();
  return cacheViolaciones;
}

function tieneViolacion(violaciones: Violacion[], regla: string, desde: string): boolean {
  return violaciones.some((v) => v.rule.name === regla && v.from === desde);
}

describe('fronteras — dependency-cruiser (D11)', () => {
  it('regla 1 — sin-ciclos: un ciclo entre dos archivos viola la regla', async () => {
    const violaciones = await violacionesDeFixtures();

    expect(tieneViolacion(violaciones, 'sin-ciclos', 'src/ciclos/modulo-a.ts')).toBe(true);
  });

  it('regla 2 — compartido-puro: compartido/ importando un paquete de npm viola la regla', async () => {
    const violaciones = await violacionesDeFixtures();

    expect(tieneViolacion(violaciones, 'compartido-puro', 'src/compartido/impuro.ts')).toBe(
      true,
    );
  });

  it('regla 3 — dominio-aislado: dominio/ importando infraestructura/ del mismo módulo viola la regla', async () => {
    const violaciones = await violacionesDeFixtures();

    expect(
      tieneViolacion(
        violaciones,
        'dominio-aislado',
        'src/modulos/pedidos/dominio/entidad-impura.ts',
      ),
    ).toBe(true);
  });

  it('regla 3 — dominio-aislado (permitido): dominio/ importando compartido/ no viola la regla', async () => {
    const violaciones = await violacionesDeFixtures();

    expect(
      tieneViolacion(violaciones, 'dominio-aislado', 'src/modulos/pedidos/dominio/entidad.ts'),
    ).toBe(false);
  });

  it('regla 3 — dominio-aislado (permitido): un test unitario junto a dominio/ puede importar una devDependency', async () => {
    const violaciones = await violacionesDeFixtures();

    expect(
      tieneViolacion(
        violaciones,
        'dominio-aislado',
        'src/modulos/pedidos/dominio/entidad.spec.ts',
      ),
    ).toBe(false);
  });

  it('regla 4 — prisma-solo-en-infraestructura: aplicacion/ importando @prisma/client viola la regla', async () => {
    const violaciones = await violacionesDeFixtures();

    expect(
      tieneViolacion(
        violaciones,
        'prisma-solo-en-infraestructura',
        'src/modulos/pedidos/aplicacion/caso-uso-prisma.ts',
      ),
    ).toBe(true);
  });

  it('regla 5 — sin-rutas-internas-de-modulo: importar una ruta interna de otro módulo viola la regla', async () => {
    const violaciones = await violacionesDeFixtures();

    expect(
      tieneViolacion(
        violaciones,
        'sin-rutas-internas-de-modulo',
        'src/modulos/envios/ruta-interna.ts',
      ),
    ).toBe(true);
  });

  it('regla 5 — sin-rutas-internas-de-modulo (permitido): importar el index.ts de otro módulo no viola la regla', async () => {
    const violaciones = await violacionesDeFixtures();

    expect(
      tieneViolacion(
        violaciones,
        'sin-rutas-internas-de-modulo',
        'src/modulos/envios/ruta-publica.ts',
      ),
    ).toBe(false);
  });

  it('regla 6 — sin-rutas-internas-de-plataforma: importar una ruta interna de un submódulo de plataforma/ viola la regla', async () => {
    const violaciones = await violacionesDeFixtures();

    expect(
      tieneViolacion(
        violaciones,
        'sin-rutas-internas-de-plataforma',
        'src/consumidor-plataforma-interna.ts',
      ),
    ).toBe(true);
  });

  it('regla 6 — sin-rutas-internas-de-plataforma: un submódulo no importa rutas internas de otro', async () => {
    const violaciones = await violacionesDeFixtures();

    expect(
      tieneViolacion(
        violaciones,
        'sin-rutas-internas-de-plataforma',
        'src/plataforma/reloj/consumidor-config-interna.ts',
      ),
    ).toBe(true);
  });

  it('regla 6 — sin-rutas-internas-de-plataforma (permitido): un submódulo importa sus propios archivos internos', async () => {
    const violaciones = await violacionesDeFixtures();

    expect(
      tieneViolacion(
        violaciones,
        'sin-rutas-internas-de-plataforma',
        'src/plataforma/config/consumidor-interno.ts',
      ),
    ).toBe(false);
  });

  it('regla 6 — sin-rutas-internas-de-plataforma (permitido): un submódulo importa el index.ts público de otro', async () => {
    const violaciones = await violacionesDeFixtures();

    expect(
      tieneViolacion(
        violaciones,
        'sin-rutas-internas-de-plataforma',
        'src/plataforma/reloj/consumidor-config-publica.ts',
      ),
    ).toBe(false);
  });

  it('regla 7 — plataforma-no-conoce-modulos: plataforma/ importando modulos/ viola la regla', async () => {
    const violaciones = await violacionesDeFixtures();

    expect(
      tieneViolacion(
        violaciones,
        'plataforma-no-conoce-modulos',
        'src/plataforma/consumidor-modulos.ts',
      ),
    ).toBe(true);
  });

  it('regla 8 — src-no-importa-test: src/ importando test/ viola la regla', async () => {
    const violaciones = await violacionesDeFixtures();

    expect(tieneViolacion(violaciones, 'src-no-importa-test', 'src/consumidor-de-test.ts')).toBe(
      true,
    );
  });

  it('regla 8 — src-no-importa-test (permitido): un test unitario junto a aplicacion/ puede importar un doble de test/fakes/', async () => {
    const violaciones = await violacionesDeFixtures();

    expect(
      tieneViolacion(
        violaciones,
        'src-no-importa-test',
        'src/modulos/pedidos/aplicacion/caso-uso.spec.ts',
      ),
    ).toBe(false);
  });

  it('regla 9 — src-sin-dev-dependencies: src/ importando una devDependency viola la regla', async () => {
    const violaciones = await violacionesDeFixtures();

    expect(
      tieneViolacion(
        violaciones,
        'src-sin-dev-dependencies',
        'src/consumidor-dev-dependency.ts',
      ),
    ).toBe(true);
  });

  it('regla 9 — src-sin-dev-dependencies (permitido): un test junto al código puede importar una devDependency', async () => {
    const violaciones = await violacionesDeFixtures();

    expect(
      tieneViolacion(
        violaciones,
        'src-sin-dev-dependencies',
        'src/plataforma/config/configuracion.spec.ts',
      ),
    ).toBe(false);
  });

  it('regla 10 — sin-irresolubles: un import que no resuelve viola la regla', async () => {
    const violaciones = await violacionesDeFixtures();

    expect(tieneViolacion(violaciones, 'sin-irresolubles', 'src/irresoluble.ts')).toBe(true);
  });

  it('regla 11 — scripts-solo-barriles-de-plataforma: importar una ruta interna viola la regla', async () => {
    const violaciones = await violacionesDeFixtures();

    expect(
      tieneViolacion(
        violaciones,
        'scripts-solo-barriles-de-plataforma',
        'scripts/consumidor-plataforma-interna.ts',
      ),
    ).toBe(true);
  });

  it('regla 11 — scripts-solo-barriles-de-plataforma: importar el index.ts público está permitido', async () => {
    const violaciones = await violacionesDeFixtures();

    expect(
      tieneViolacion(
        violaciones,
        'scripts-solo-barriles-de-plataforma',
        'scripts/consumidor-plataforma-publica.ts',
      ),
    ).toBe(false);
  });

  it('PER14 — Un import de PrismaService desde aplicacion, puertos o interfaz de un módulo falla la verificación de fronteras', async () => {
    const violaciones = await violacionesDeFixtures();

    expect(
      tieneViolacion(
        violaciones,
        'prisma-service-solo-en-infraestructura',
        'src/modulos/pedidos/aplicacion/caso-uso-prisma-service.ts',
      ),
    ).toBe(true);
  });

  it('PER14 — El módulo raíz de composición puede importar PrismaModule sin fallar', async () => {
    const violaciones = await violacionesDeFixtures();

    expect(
      tieneViolacion(
        violaciones,
        'prisma-service-solo-en-infraestructura',
        'src/modulos/pedidos/pedidos.module.ts',
      ),
    ).toBe(false);
  });

  it('regla 13 — solo-conversaciones-importa-canales: otro módulo importando el barril de canales viola la regla', async () => {
    const violaciones = await violacionesDeFixtures();

    expect(
      tieneViolacion(
        violaciones,
        'solo-conversaciones-importa-canales',
        'src/modulos/envios/importa-canales.ts',
      ),
    ).toBe(true);
  });

  it('regla 13 — solo-conversaciones-importa-canales (permitido): conversaciones importa el barril de canales', async () => {
    const violaciones = await violacionesDeFixtures();

    expect(
      tieneViolacion(
        violaciones,
        'solo-conversaciones-importa-canales',
        'src/modulos/conversaciones/consumidor.ts',
      ),
    ).toBe(false);
  });

  it('LLM11 — SDK del proveedor solo aparece en la infraestructura de llm', async () => {
    const violaciones = await violacionesDeFixtures();

    expect(
      tieneViolacion(
        violaciones,
        'ai-solo-en-infraestructura-llm',
        'src/modulos/pedidos/aplicacion/caso-uso-sdk-llm.ts',
      ),
    ).toBe(true);
    expect(
      tieneViolacion(
        violaciones,
        'ai-solo-en-infraestructura-llm',
        'src/modulos/pedidos/aplicacion/caso-uso-provider-llm.ts',
      ),
    ).toBe(true);
  });

  it('regla 14 — ai-solo-en-infraestructura-llm (permitido): la infraestructura de llm importa el SDK y el provider', async () => {
    const violaciones = await violacionesDeFixtures();

    expect(
      tieneViolacion(
        violaciones,
        'ai-solo-en-infraestructura-llm',
        'src/modulos/llm/infraestructura/adaptador-permitido.ts',
      ),
    ).toBe(false);
  });

  it('regla 15 — conversaciones-no-conoce-agente: conversaciones importando el barril de agente viola la regla', async () => {
    const violaciones = await violacionesDeFixtures();

    expect(
      tieneViolacion(
        violaciones,
        'conversaciones-no-conoce-agente',
        'src/modulos/conversaciones/importa-agente.ts',
      ),
    ).toBe(true);
  });

  it('regla 15 — conversaciones-no-conoce-agente (permitido): agente importa el barril de conversaciones', async () => {
    const violaciones = await violacionesDeFixtures();

    expect(
      tieneViolacion(
        violaciones,
        'conversaciones-no-conoce-agente',
        'src/modulos/agente/importa-conversaciones.ts',
      ),
    ).toBe(false);
  });
});
