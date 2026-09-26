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

describe('medios/aplicacion/collage', () => {
  describe('MED8 — generación de collage en grilla según la cantidad de fotos', () => {
    it('MED8 — De 1 a 4 fotos generan un collage en grilla 2×2', async () => {
      const buffer = await construirCollage(await fotos(4));

      const metadatos = await sharp(buffer).metadata();

      expect(metadatos.format).toBe('jpeg');
      expect(metadatos.width).toBe(LADO_TILE * 2);
      expect(metadatos.height).toBe(LADO_TILE * 2);
    });

    it('MED8 — 5 o 6 fotos generan un collage en grilla 2×3', async () => {
      const buffer = await construirCollage(await fotos(6));

      const metadatos = await sharp(buffer).metadata();

      expect(metadatos.format).toBe('jpeg');
      expect(metadatos.width).toBe(LADO_TILE * 2);
      expect(metadatos.height).toBe(LADO_TILE * 3);
    });
  });
});
