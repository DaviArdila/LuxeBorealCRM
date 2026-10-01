/**
 * Generación de collage a partir de las fotos de un producto (D12, MED8). Vive en `aplicacion/`, no
 * en `dominio/`, porque usa `sharp`: la regla `dominio-aislado` prohibiría ese import bajo `dominio/`
 * (D12). Es puro en comportamiento — determinístico, sin puertos inyectados, sin tocar red ni disco,
 * solo transforma buffers de imagen en memoria — aunque no en ubicación de carpeta.
 */

import sharp from 'sharp';

const LADO_TILE_PX = 400;
const COLUMNAS = 2;
const MIN_FOTOS_COLLAGE = 2;
const MAX_FOTOS_COLLAGE = 6;
const CALIDAD_JPEG_COLLAGE = 85;
const FONDO_COLLAGE = { r: 255, g: 255, b: 255 };

export interface FotoParaCollage {
  readonly buffer: Buffer;
}

interface Casilla {
  readonly left: number;
  readonly top: number;
  readonly ancho: number;
  readonly alto: number;
}

/**
 * Reparte las fotos en una grilla de 2 columnas sin casillas vacías (MED8): una foto de más en cantidad
 * impar ocupa toda la fila inferior. 2 fotos → 2×1, 3 → 2×2 con la tercera ancha, 4 → 2×2, 5 → 2×3 con
 * la quinta ancha, 6 → 2×3.
 */
function repartirCasillas(cantidad: number): readonly Casilla[] {
  const anchoCollage = LADO_TILE_PX * COLUMNAS;
  const ultimaEsAncha = cantidad % COLUMNAS === 1;
  return Array.from({ length: cantidad }, (_, indice) => {
    const top = Math.floor(indice / COLUMNAS) * LADO_TILE_PX;
    if (ultimaEsAncha && indice === cantidad - 1) {
      return { left: 0, top, ancho: anchoCollage, alto: LADO_TILE_PX };
    }
    return { left: (indice % COLUMNAS) * LADO_TILE_PX, top, ancho: LADO_TILE_PX, alto: LADO_TILE_PX };
  });
}

/**
 * Compone el collage de un producto con 2 a 6 fotos (MED8): cada casilla se recorta para llenar el espacio
 * (`cover`) y el resultado es un JPEG calidad 85. Con menos de 2 fotos devuelve `null`: una sola foto ya es
 * lo que se envía y no hay nada que agrupar. Más de 6 es un error de quien llama (el importador limita a 6).
 */
export async function construirCollage(fotos: readonly FotoParaCollage[]): Promise<Buffer | null> {
  if (fotos.length < MIN_FOTOS_COLLAGE) {
    return null;
  }
  if (fotos.length > MAX_FOTOS_COLLAGE) {
    throw new RangeError(`un collage admite como máximo ${String(MAX_FOTOS_COLLAGE)} fotos, llegaron ${String(fotos.length)}`);
  }

  const casillas = repartirCasillas(fotos.length);
  const alto = Math.max(...casillas.map((casilla) => casilla.top + casilla.alto));

  const composicion = await Promise.all(
    fotos.map(async (foto, indice) => {
      const casilla = casillas[indice];
      if (casilla === undefined) {
        throw new RangeError('casilla ausente para una foto del collage');
      }
      const tile = await sharp(foto.buffer).resize(casilla.ancho, casilla.alto, { fit: 'cover' }).toBuffer();
      return { input: tile, left: casilla.left, top: casilla.top };
    }),
  );

  return sharp({
    create: { width: LADO_TILE_PX * COLUMNAS, height: alto, channels: 3, background: FONDO_COLLAGE },
  })
    .composite(composicion)
    .jpeg({ quality: CALIDAD_JPEG_COLLAGE })
    .toBuffer();
}
