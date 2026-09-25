import { describe, expect, it } from 'vitest';
import { construirDocumentosContrato } from '../../scripts/generar-contrato.js';

/**
 * Nota de nombre de archivo (desviación registrada, T4): `tasks.md` sugiere
 * `test/contrato/documento-interno.e2e-spec.ts`, pero `vitest.config.ts` solo incluye
 * `test/contrato/**\/*.spec.ts` en el proyecto `unit` (los `*.e2e-spec.ts` solo corren desde
 * `test/e2e/`, que exige Testcontainers reales). Un archivo con ese sufijo, dentro de
 * `test/contrato/`, no lo recogería ningún proyecto de Vitest. Se nombra `documento-interno.spec.ts`
 * para que Vitest lo ejecute — mismo criterio de sufijo que `documentacion.spec.ts`,
 * `errores.spec.ts` y `convenciones.spec.ts`, ya existentes en este mismo directorio.
 */
describe('API8 — /health en el documento interno vs. el documento público (D1, D6)', () => {
  it('el documento interno contiene /health etiquetado internal; el público no, y queda con paths: {}', async () => {
    const documentos = await construirDocumentosContrato();
    const interno = JSON.parse(documentos.interno) as {
      readonly paths: Record<string, { readonly get?: { readonly tags?: readonly string[] } }>;
    };
    const publico = JSON.parse(documentos.publico) as { readonly paths: Record<string, unknown> };

    expect(interno.paths).toHaveProperty('/health');
    expect(interno.paths['/health']?.get?.tags).toContain('internal');
    expect(publico.paths).not.toHaveProperty('/health');
    expect(publico.paths).toEqual({});
  });

  it('el esquema documentado de /health viene de esquemaRespuestaSalud, no del genérico de Terminus', async () => {
    const documentos = await construirDocumentosContrato();
    const interno = JSON.parse(documentos.interno) as {
      readonly paths: {
        readonly ['/health']: {
          readonly get: {
            readonly responses: {
              readonly ['200']: {
                readonly content: {
                  readonly ['application/json']: {
                    readonly schema: { readonly properties?: Record<string, unknown> };
                  };
                };
              };
            };
          };
        };
      };
    };
    const esquema = interno.paths['/health'].get.responses['200'].content['application/json'].schema;

    // El esquema genérico de Terminus documenta `status` con el enum ['ok', 'degraded'] (solo dos
    // valores); esquemaRespuestaSalud documenta los cuatro valores reales de HealthCheckStatus
    // ('ok' | 'error' | 'degraded' | 'shutting_down') — la presencia de 'shutting_down' confirma
    // que el esquema documentado es el de zod, no el que Terminus agrega por defecto.
    const status = esquema.properties?.status as { readonly enum?: readonly string[] } | undefined;
    expect(status?.enum).toContain('shutting_down');
    expect(esquema.properties).toHaveProperty('details');
  });
});
