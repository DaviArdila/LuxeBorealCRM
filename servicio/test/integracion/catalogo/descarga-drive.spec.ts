import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { descargarFoto, ImagenInvalida } from '../../../src/modulos/catalogo/infraestructura/descarga-drive.js';

/**
 * Servidor HTTP local que simula las tres respuestas reales de una descarga de foto (design.md,
 * "Testing Strategy" — MED4, magic bytes): ningún test de este archivo golpea la red real.
 */
let servidor: Server;
let urlBase: string;

const FIRMA_JPEG_VALIDA = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

beforeAll(async () => {
  servidor = createServer((req, res) => {
    const ruta = req.url ?? '/';

    if (ruta === '/html-acceso-denegado') {
      res.writeHead(200, { 'content-type': 'text/html; charset=UTF-8' });
      res.end('<!DOCTYPE html><html><body>No tienes permiso para ver este archivo</body></html>');
      return;
    }

    if (ruta === '/bytes-invalidos-content-type-imagen') {
      res.writeHead(200, { 'content-type': 'image/jpeg' });
      res.end(Buffer.from('esto no es una imagen, solo texto plano'));
      return;
    }

    if (ruta === '/imagen-valida-content-type-generico') {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(FIRMA_JPEG_VALIDA);
      return;
    }

    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => servidor.listen(0, resolve));
  const direccion = servidor.address() as AddressInfo;
  urlBase = `http://127.0.0.1:${direccion.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => servidor.close(() => resolve()));
});

describe('descarga-drive (T6, integración — MED4)', () => {
  it('MED4 — Una respuesta HTML se rechaza aunque no lo diga el content-type', async () => {
    await expect(descargarFoto(`${urlBase}/html-acceso-denegado`)).rejects.toBeInstanceOf(ImagenInvalida);
  });

  it('MED4 — Unos bytes que no son de JPEG, PNG ni WEBP se rechazan aunque el content-type diga imagen', async () => {
    await expect(
      descargarFoto(`${urlBase}/bytes-invalidos-content-type-imagen`),
    ).rejects.toBeInstanceOf(ImagenInvalida);
  });

  it('MED4 — Una imagen válida se acepta por sus magic bytes aunque el content-type sea genérico', async () => {
    const buffer = await descargarFoto(`${urlBase}/imagen-valida-content-type-generico`);

    expect(buffer.equals(FIRMA_JPEG_VALIDA)).toBe(true);
  });
});
