import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FuenteCatalogoSheets } from '../../../src/modulos/catalogo/infraestructura/fuente-catalogo-sheets.js';
import { PestanaNoDisponible } from '../../../src/modulos/catalogo/puertos/fuente-catalogo.js';

/**
 * Servidor HTTP local que simula el endpoint gviz de Google Sheets (design.md, Testing Strategy):
 * ningún test de este archivo golpea la red real. Responde según el `sheetId` de la ruta
 * `/spreadsheets/d/<sheetId>/gviz/tq`, simulando los tres casos reales de IMP1/IMP2.
 */
let servidor: Server;
let urlBase: string;

beforeAll(async () => {
  servidor = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const sheetId = url.pathname.split('/')[3];
    const pestana = url.searchParams.get('sheet');

    if (sheetId === 'sheet-no-compartida') {
      res.writeHead(200, { 'content-type': 'text/html; charset=UTF-8' });
      res.end('<!DOCTYPE html><html><body>Inicia sesión para continuar</body></html>');
      return;
    }

    if (sheetId === 'sheet-sin-cobertura' && pestana === 'cobertura') {
      res.writeHead(400, { 'content-type': 'text/plain; charset=UTF-8' });
      res.end('Invalid query: sheet not found');
      return;
    }

    res.writeHead(200, { 'content-type': 'text/csv; charset=UTF-8' });
    res.end(`pestana\n${pestana}\n`);
  });
  await new Promise<void>((resolve) => servidor.listen(0, resolve));
  const direccion = servidor.address() as AddressInfo;
  urlBase = `http://127.0.0.1:${direccion.port}/spreadsheets`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => servidor.close(() => resolve()));
});

describe('FuenteCatalogoSheets (T4, integración — IMP1, IMP2)', () => {
  it('IMP1 — Leer desde Google Sheets descarga cada pestaña por su nombre', async () => {
    const fuente = new FuenteCatalogoSheets('sheet-compartida', urlBase);

    const productos = await fuente.leerPestana('productos');
    const tarifas = await fuente.leerPestana('tarifas');

    expect(productos).toEqual([{ pestana: 'productos' }]);
    expect(tarifas).toEqual([{ pestana: 'tarifas' }]);
  });

  it('IMP2 — Una hoja no compartida por enlace responde HTML y el importador falla con un error claro', async () => {
    const fuente = new FuenteCatalogoSheets('sheet-no-compartida', urlBase);

    await expect(fuente.leerPestana('productos')).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(PestanaNoDisponible);
      const pestanaNoDisponible = error as PestanaNoDisponible;
      expect(pestanaNoDisponible.pestana).toBe('productos');
      expect(pestanaNoDisponible.motivo).toBe('no_compartida');
      return true;
    });
  });

  it('IMP2 — Una pestaña inexistente falla con un error que la nombra', async () => {
    const fuente = new FuenteCatalogoSheets('sheet-sin-cobertura', urlBase);

    await expect(fuente.leerPestana('cobertura')).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(PestanaNoDisponible);
      const pestanaNoDisponible = error as PestanaNoDisponible;
      expect(pestanaNoDisponible.pestana).toBe('cobertura');
      expect(pestanaNoDisponible.motivo).toBe('inexistente');
      return true;
    });
  });
});
