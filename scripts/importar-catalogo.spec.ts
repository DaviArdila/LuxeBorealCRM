import { describe, expect, it } from 'vitest';
import { ArgumentosImportacionInvalidos, parsearArgumentosImportacion } from './importar-catalogo.js';

describe('scripts/importar-catalogo — parseo de argumentos (T10, IMP13)', () => {
  it('IMP13 — Ejecutar el comando sin --sheet-id ni --dir falla con un error claro', () => {
    expect(() => parsearArgumentosImportacion([])).toThrow(ArgumentosImportacionInvalidos);
    expect(() => parsearArgumentosImportacion([])).toThrow(/--sheet-id.*--dir|--dir.*--sheet-id/);
  });

  it('pasar --sheet-id y --dir a la vez también falla (exige exactamente uno)', () => {
    expect(() =>
      parsearArgumentosImportacion(['--sheet-id', 'abc123', '--dir', 'test/fixtures/catalogo']),
    ).toThrow(ArgumentosImportacionInvalidos);
  });

  it('--dir sin --sheet-id se acepta y apunta al directorio indicado', () => {
    const argumentos = parsearArgumentosImportacion(['--dir', 'test/fixtures/catalogo']);

    expect(argumentos.origen).toEqual({ tipo: 'directorio', directorio: 'test/fixtures/catalogo' });
    expect(argumentos.soloValidar).toBe(false);
  });

  it('--sheet-id sin --dir se acepta y apunta a la hoja indicada', () => {
    const argumentos = parsearArgumentosImportacion(['--sheet-id', 'abc123']);

    expect(argumentos.origen).toEqual({ tipo: 'sheet', sheetId: 'abc123' });
  });

  it('--solo-validar se detecta independientemente de su posición entre los demás flags', () => {
    const antes = parsearArgumentosImportacion(['--solo-validar', '--dir', 'test/fixtures/catalogo']);
    const despues = parsearArgumentosImportacion(['--dir', 'test/fixtures/catalogo', '--solo-validar']);

    expect(antes.soloValidar).toBe(true);
    expect(despues.soloValidar).toBe(true);
  });

  it('sin --solo-validar, el valor por defecto es false', () => {
    const argumentos = parsearArgumentosImportacion(['--dir', 'test/fixtures/catalogo']);

    expect(argumentos.soloValidar).toBe(false);
  });
});
