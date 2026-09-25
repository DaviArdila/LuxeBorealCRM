import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolverRaizRepositorio } from '../../scripts/herramientas.js';
import {
  compararContenidoContrato,
  verificarDerivaContrato,
} from '../../scripts/verificar-deriva-contrato.js';

const raiz = resolverRaizRepositorio();
const rutaInterno = path.join(raiz, 'openapi', 'openapi.interno.json');
const rutaPublico = path.join(raiz, 'openapi', 'openapi.json');

describe('API1 — La verificación de deriva compara bytes y explica diferencias', () => {
  it('PLT7 — Un endpoint modificado sin regenerar el contrato hace fallar npm run verify: nombra el archivo y la primera línea distinta', () => {
    const esperado = '{\n  "info": {\n    "version": "0.0.1"\n  }\n}\n';
    const guardado = Buffer.from('{\n  "info": {\n    "version": "0.0.2"\n  }\n}\n', 'utf8');

    const resultado = compararContenidoContrato('openapi/openapi.json', esperado, guardado);

    expect(resultado.limpio).toBe(false);
    expect(resultado.mensaje).toContain('openapi/openapi.json');
    expect(resultado.mensaje).toContain('línea 3');
    expect(resultado.mensaje).toContain('npm run contrato:generar');
  });

  it('distingue una deriva que solo cambia los finales de línea', () => {
    const esperado = '{\n  "openapi": "3.1.0"\n}\n';
    const guardado = Buffer.from('{\r\n  "openapi": "3.1.0"\r\n}\r\n', 'utf8');

    const resultado = compararContenidoContrato('openapi/openapi.interno.json', esperado, guardado);

    expect(resultado.limpio).toBe(false);
    expect(resultado.mensaje).toContain('solo en fin de línea');
    expect(resultado.mensaje).toContain('.gitattributes');
  });
});

/**
 * Los dos escenarios de abajo ejercitan `verificarDerivaContrato()` real (D2, T3): regenera ambos
 * documentos desde la app real (`AppModule`, sin fixture) y los compara contra los dos archivos
 * `openapi/*.json` **commiteados** de este repositorio, en disco — no strings fabricados como los
 * tests de arriba. Ninguno de los dos escribe el resultado de vuelta (`verificarDerivaContrato`
 * nunca escribe); el segundo escenario sí muta temporalmente el archivo interno commiteado para
 * simular un cambio sin regenerar, y lo restaura byte a byte en `finally` antes de terminar.
 */
describe('API1/PLT7 — verificarDerivaContrato() contra los documentos commiteados reales', () => {
  it('API1 — El contrato generado coincide con el commiteado', async () => {
    const resultado = await verificarDerivaContrato();

    expect(resultado.limpio).toBe(true);
    expect(resultado.mensaje).toContain('openapi/openapi.interno.json coincide byte a byte');
    expect(resultado.mensaje).toContain('openapi/openapi.json coincide byte a byte');
  });

  it(
    'PLT7 — Un cambio en /health sin regenerar el contrato se detecta aunque el documento público esté vacío',
    async () => {
      // Confirma la premisa del escenario: el documento público hoy no tiene endpoints de
      // negocio, así que un cambio en /health (excluido de él, API8) nunca podría detectarse
      // comparando solo ese archivo.
      const publicoOriginal = JSON.parse(await readFile(rutaPublico, 'utf8')) as {
        readonly paths: Record<string, unknown>;
      };
      expect(publicoOriginal.paths).toEqual({});

      const internoOriginal = await readFile(rutaInterno, 'utf8');
      expect(internoOriginal).toContain('/health');

      try {
        // Cambia un campo real de /health en el documento interno commiteado, sin volver a
        // ejecutar "contrato:generar" — exactamente el caso que este escenario describe.
        const internoMutado = internoOriginal.replace(
          'Estado de salud operativo de Postgres y Redis.',
          'Estado de salud operativo de Postgres y Redis (mutado por el test).',
        );
        expect(internoMutado).not.toBe(internoOriginal);
        await writeFile(rutaInterno, internoMutado, 'utf8');

        const resultado = await verificarDerivaContrato();

        expect(resultado.limpio).toBe(false);
        // La falla se explica por el documento interno (el único que contiene /health), no por
        // el público, que sigue coincidiendo (paths: {} en ambos lados, sin tocarse).
        expect(resultado.mensaje).toContain('openapi/openapi.interno.json difiere');
        expect(resultado.mensaje).toContain('openapi/openapi.json coincide byte a byte');
      } finally {
        await writeFile(rutaInterno, internoOriginal, 'utf8');
        const restaurado = await verificarDerivaContrato();
        expect(restaurado.limpio).toBe(true);
      }
    },
    // Construye la app real (AppModule) dos veces; bajo la contención de Docker documentada por
    // T6/T7, 30 s puede no bastar en una corrida de npm run ci con otros archivos usando Docker en
    // paralelo.
    60_000,
  );
});
