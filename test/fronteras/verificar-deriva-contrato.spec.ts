import { describe, expect, it } from 'vitest';
import { compararContenidoContrato } from '../../scripts/verificar-deriva-contrato.js';

describe('API1 — La verificación de deriva compara bytes y explica diferencias', () => {
  it('nombra el archivo y la primera línea distinta', () => {
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
