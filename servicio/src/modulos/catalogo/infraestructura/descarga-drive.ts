/**
 * Descarga de fotos de producto desde un enlace de la hoja (MED2-MED4, T6 de
 * `openspec/changes/fase-03-importador-medios/design.md`). Portado de
 * `../ChatLuxeCRM/src/catalogo/drive.ts` a las reglas de esta fase: conversión de enlaces de Google
 * Drive a descarga directa (MED2), rechazo de enlaces de carpeta antes de cualquier petición de red
 * (MED3), y validación por *magic bytes* del cuerpo descargado (MED4) — nunca solo por
 * `content-type`, porque Drive devuelve HTML de "acceso denegado" en vez de la imagen cuando el
 * archivo no está compartido por enlace.
 *
 * Mitigación SSRF (matriz de amenazas de la fase): solo se aceptan enlaces `http://`/`https://`
 * ({@link validarEsquemaPermitido}); la conversión de Drive siempre normaliza a un dominio fijo
 * (`drive.google.com`) antes de pedir. No se pasa `redirect: 'manual'` a `fetch`: el propio
 * algoritmo de `fetch` (WHATWG) ya trata una redirección a un esquema distinto de `http`/`https`
 * como un error de red, así que un enlace no-Drive nunca puede saltar a un esquema no-HTTP siguiendo
 * redirecciones.
 */

const HOSTS_DRIVE = new Set(['drive.google.com', 'docs.google.com']);

/** Firmas de *magic bytes* reconocidas (MED4): JPEG, PNG y el contenedor RIFF/WEBP. */
const FIRMA_JPEG = [0xff, 0xd8, 0xff];
const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const FIRMA_RIFF = [0x52, 0x49, 0x46, 0x46]; // 'RIFF'
const FIRMA_WEBP = [0x57, 0x45, 0x42, 0x50]; // 'WEBP', en el byte 8 del contenedor RIFF

/** Enlace de una carpeta de Google Drive, no de un archivo individual (MED3). */
export class EnlaceCarpetaDrive extends Error {
  constructor(public readonly enlace: string) {
    super(
      `El enlace "${enlace}" es el de una carpeta de Google Drive: se necesita el enlace de cada ` +
        'foto individual, no el de la carpeta que las contiene.',
    );
    this.name = 'EnlaceCarpetaDrive';
  }
}

/**
 * El cuerpo descargado no es una imagen JPEG, PNG ni WEBP válida (MED4): la respuesta puede ser
 * HTML (archivo no compartido por enlace) o bytes que no corresponden a ninguna firma conocida,
 * aunque el `content-type` declarado diga lo contrario.
 */
export class ImagenInvalida extends Error {
  constructor(public readonly enlace: string) {
    super(
      `La foto en "${enlace}" no es una imagen JPEG, PNG ni WEBP válida: revisa que el archivo esté ` +
        'compartido como "Cualquier persona con el enlace: Lector".',
    );
    this.name = 'ImagenInvalida';
  }
}

/** El enlace convertido no usa `http://` ni `https://` (mitigación SSRF de la matriz de amenazas). */
export class EsquemaNoPermitido extends Error {
  constructor(public readonly enlace: string) {
    super(`El enlace "${enlace}" no usa http ni https.`);
    this.name = 'EsquemaNoPermitido';
  }
}

/**
 * Convierte un enlace de archivo de Google Drive (`/file/d/ID/`, `open?id=ID`, `uc?id=ID`) a la URL
 * de descarga directa `https://drive.google.com/uc?export=download&id=<ID>` (MED2). Un enlace que
 * no es de `drive.google.com`/`docs.google.com`, o del que no se puede extraer un ID, se devuelve
 * sin cambios.
 */
export function convertirEnlaceDrive(enlace: string): string {
  const url = intentarParsearUrl(enlace);
  if (url === null || !HOSTS_DRIVE.has(url.hostname)) return enlace;

  const id = extraerIdDrive(url);
  if (id === null) return enlace;

  return `https://drive.google.com/uc?export=download&id=${id}`;
}

/**
 * Detecta un enlace de carpeta de Google Drive (`drive.google.com/drive/.../folders/...`, MED3):
 * pura, sin ningún I/O, para que {@link descargarFoto} pueda rechazarlo antes de cualquier petición.
 */
export function esEnlaceCarpetaDrive(enlace: string): boolean {
  const url = intentarParsearUrl(enlace);
  return url !== null && url.hostname === 'drive.google.com' && url.pathname.includes('/folders/');
}

/**
 * Descarga la foto de `enlace` (MED2-MED4): rechaza un enlace de carpeta antes de cualquier
 * petición (MED3), convierte el enlace de Drive a descarga directa (MED2), valida el esquema y
 * valida el cuerpo descargado por sus *magic bytes* (MED4).
 */
export async function descargarFoto(enlace: string): Promise<Buffer> {
  if (esEnlaceCarpetaDrive(enlace)) {
    throw new EnlaceCarpetaDrive(enlace);
  }

  const urlDescarga = convertirEnlaceDrive(enlace);
  validarEsquemaPermitido(urlDescarga);

  const respuesta = await fetch(urlDescarga);
  const buffer = Buffer.from(await respuesta.arrayBuffer());

  if (!esImagenValida(buffer)) {
    throw new ImagenInvalida(enlace);
  }

  return buffer;
}

function intentarParsearUrl(enlace: string): URL | null {
  try {
    return new URL(enlace);
  } catch {
    return null;
  }
}

function extraerIdDrive(url: URL): string | null {
  const idEnRuta = url.pathname.match(/\/d\/([^/]+)/);
  if (idEnRuta !== null) return idEnRuta[1];

  return url.searchParams.get('id');
}

function validarEsquemaPermitido(enlace: string): void {
  const url = intentarParsearUrl(enlace);
  if (url === null || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    throw new EsquemaNoPermitido(enlace);
  }
}

/**
 * Solo se confía en los primeros bytes del cuerpo (MED4): nunca en el `content-type` declarado,
 * que Drive puede reportar erróneamente (o que un servidor de terceros puede falsificar).
 */
function esImagenValida(buffer: Buffer): boolean {
  if (tieneFirma(buffer, FIRMA_JPEG, 0)) return true;
  if (tieneFirma(buffer, FIRMA_PNG, 0)) return true;
  if (tieneFirma(buffer, FIRMA_RIFF, 0) && tieneFirma(buffer, FIRMA_WEBP, 8)) return true;
  return false;
}

function tieneFirma(buffer: Buffer, firma: readonly number[], desde: number): boolean {
  if (buffer.length < desde + firma.length) return false;
  return firma.every((byte, indice) => buffer[desde + indice] === byte);
}
