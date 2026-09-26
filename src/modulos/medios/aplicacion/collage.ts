/**
 * Generación de collage a partir de las fotos de un producto (D12, MED8). Vive en `aplicacion/`, no
 * en `dominio/`, porque usa `sharp`: la regla `dominio-aislado` prohibiría ese import bajo `dominio/`
 * (D12). Es puro en comportamiento — determinístico, sin puertos inyectados, sin tocar red ni disco,
 * solo transforma buffers de imagen en memoria — aunque no en ubicación de carpeta.
 */

import sharp from 'sharp';

const LADO_TILE_PX = 400;
const COLUMNAS = 2;
const MAX_FOTOS_GRILLA_2X2 = 4;
const FILAS_GRILLA_2X2 = 2;
const FILAS_GRILLA_2X3 = 3;
const CALIDAD_JPEG_COLLAGE = 85;
const FONDO_COLLAGE = { r: 255, g: 255, b: 255 };

export interface FotoParaCollage {
  readonly buffer: Buffer;
}

/**
 * Compone el collage de un producto: grilla 2×2 (1 a 4 fotos) o 2×3 (5 o 6 fotos), con cada tile de
 * 400×400 píxeles recortado para llenar el espacio (`cover`, MED8), codificado como JPEG calidad 85.
 */
export async function construirCollage(fotos: readonly FotoParaCollage[]): Promise<Buffer> {
  const filas = fotos.length > MAX_FOTOS_GRILLA_2X2 ? FILAS_GRILLA_2X3 : FILAS_GRILLA_2X2;
  const anchoCollage = LADO_TILE_PX * COLUMNAS;
  const altoCollage = LADO_TILE_PX * filas;

  const tiles = await Promise.all(
    fotos.map((foto) =>
      sharp(foto.buffer)
        .resize(LADO_TILE_PX, LADO_TILE_PX, { fit: 'cover' })
        .toBuffer(),
    ),
  );

  const composicion = tiles.map((tile, indice) => ({
    input: tile,
    left: (indice % COLUMNAS) * LADO_TILE_PX,
    top: Math.floor(indice / COLUMNAS) * LADO_TILE_PX,
  }));

  return sharp({
    create: {
      width: anchoCollage,
      height: altoCollage,
      channels: 3,
      background: FONDO_COLLAGE,
    },
  })
    .composite(composicion)
    .jpeg({ quality: CALIDAD_JPEG_COLLAGE })
    .toBuffer();
}
