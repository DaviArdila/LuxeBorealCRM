import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { construirCollage, type FotoParaCollage } from './collage.js';

const LADO_TILE = 400;

async function fotoDeColor(color: { r: number; g: number; b: number }): Promise<FotoParaCollage> {
  const buffer = await sharp({
    create: { width: 100, height: 100, channels: 3, background: color },
  })
    .jpeg()
    .toBuffer();
  return { buffer };
}

async function fotos(cantidad: number): Promise<readonly FotoParaCollage[]> {
  const colores = [
    { r: 255, g: 0, b: 0 },
    { r: 0, g: 255, b: 0 },
    { r: 0, g: 0, b: 255 },
    { r: 255, g: 255, b: 0 },
    { r: 0, g: 255, b: 255 },
    { r: 255, g: 0, b: 255 },
  ];
  return Promise.all(colores.slice(0, cantidad).map((color) => fotoDeColor(color)));
}

/** Color del píxel (x, y) del collage ya codificado; sirve para comprobar que no queda zona en blanco. */
async function pixel(buffer: Buffer, x: number, y: number): Promise<readonly number[]> {
  const crudo = await sharp(buffer).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer();
  return [...crudo];
}

function esBlanco(rgb: readonly number[]): boolean {
  return rgb.every((canal) => canal > 240);
}

async function dimensiones(buffer: Buffer): Promise<{ ancho: number; alto: number }> {
  const metadatos = await sharp(buffer).metadata();
  expect(metadatos.format).toBe('jpeg');
  return { ancho: metadatos.width, alto: metadatos.height };
}

describe('medios/aplicacion/collage', () => {
  describe('MED8 — generación de collage en grilla según la cantidad de fotos', () => {
    it('MED8 — Una sola foto no genera collage', async () => {
      await expect(construirCollage(await fotos(1))).resolves.toBeNull();
      await expect(construirCollage([])).resolves.toBeNull();
    });

    it('MED8 — Dos fotos generan un collage 2×1 sin casillas vacías', async () => {
      const buffer = await construirCollage(await fotos(2));

      expect(buffer).not.toBeNull();
      await expect(dimensiones(buffer as Buffer)).resolves.toEqual({ ancho: LADO_TILE * 2, alto: LADO_TILE });
      expect(esBlanco(await pixel(buffer as Buffer, 600, 200))).toBe(false);
    });

    it('MED8 — Tres fotos generan un collage sin casilla en blanco', async () => {
      const buffer = (await construirCollage(await fotos(3))) as Buffer;

      await expect(dimensiones(buffer)).resolves.toEqual({ ancho: LADO_TILE * 2, alto: LADO_TILE * 2 });
      expect(esBlanco(await pixel(buffer, 100, 600))).toBe(false);
      expect(esBlanco(await pixel(buffer, 700, 600))).toBe(false);
    });

    it('MED8 — Cuatro fotos generan un collage en grilla 2×2', async () => {
      const buffer = (await construirCollage(await fotos(4))) as Buffer;

      await expect(dimensiones(buffer)).resolves.toEqual({ ancho: LADO_TILE * 2, alto: LADO_TILE * 2 });
      expect(esBlanco(await pixel(buffer, 700, 700))).toBe(false);
    });

    it('MED8 — Cinco fotos generan un collage sin casilla en blanco', async () => {
      const buffer = (await construirCollage(await fotos(5))) as Buffer;

      await expect(dimensiones(buffer)).resolves.toEqual({ ancho: LADO_TILE * 2, alto: LADO_TILE * 3 });
      expect(esBlanco(await pixel(buffer, 100, 1100))).toBe(false);
      expect(esBlanco(await pixel(buffer, 700, 1100))).toBe(false);
    });

    it('MED8 — Seis fotos generan un collage en grilla 2×3', async () => {
      const buffer = (await construirCollage(await fotos(6))) as Buffer;

      await expect(dimensiones(buffer)).resolves.toEqual({ ancho: LADO_TILE * 2, alto: LADO_TILE * 3 });
      expect(esBlanco(await pixel(buffer, 700, 1100))).toBe(false);
    });

    it('rechaza más de seis fotos en vez de desbordar el lienzo', async () => {
      const siete = [...(await fotos(6)), ...(await fotos(1))];

      await expect(construirCollage(siete)).rejects.toThrow(RangeError);
    });
  });
});
