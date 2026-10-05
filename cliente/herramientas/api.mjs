// Generación y deriva del cliente HTTP de `src/app/api/` desde el contrato público (CLT2, D8 de la
// Fase 11b). Es del propio cliente (ADR-0023): usa el `ng-openapi-gen` de sus dependencias y no
// necesita nada del servicio, solo el contrato en `../openapi/openapi.json`.
//
//   node herramientas/api.mjs generar   (npm run api:generar)
//   node herramientas/api.mjs deriva    (npm run api:deriva)
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const ejecutar = promisify(execFile);

const AYUDA_INSTALAR = 'Instala las dependencias del cliente con: npm --prefix cliente ci';

/**
 * @typedef {{ limpio: boolean, mensaje: string }} Resultado
 * @typedef {{ raizCliente?: string, contrato?: string }} Opciones
 *   `raizCliente`: carpeta del cliente; por defecto la que contiene esta herramienta.
 *   `contrato`: contrato OpenAPI de entrada; por defecto `../openapi/openapi.json` (el público).
 */

/** @param {string} raizCliente */
function rutasDelCliente(raizCliente) {
  return {
    config: path.join(raizCliente, 'ng-openapi-gen.json'),
    generado: path.join(raizCliente, 'src', 'app', 'api'),
    bin: path.join(raizCliente, 'node_modules', 'ng-openapi-gen', 'lib', 'index.js'),
    contratoPorDefecto: path.join(raizCliente, '..', 'openapi', 'openapi.json'),
  };
}

/** @param {Opciones} opciones */
function resolverRaizCliente(opciones) {
  return opciones.raizCliente ?? path.resolve(import.meta.dirname, '..');
}

/**
 * @param {string} raizCliente
 * @param {string | undefined} contrato
 * @param {string} salida
 */
async function correrGenerador(raizCliente, contrato, salida) {
  const rutas = rutasDelCliente(raizCliente);
  const args = [rutas.bin, '-c', rutas.config, '--output', salida, '--input', contrato ?? rutas.contratoPorDefecto];
  await ejecutar(process.execPath, args, { cwd: raizCliente, maxBuffer: 16 * 1024 * 1024 });
  await normalizarFinDeLinea(salida);
}

/**
 * `ng-openapi-gen` escribe con el fin de línea del sistema (CRLF en Windows) y git guarda lo generado
 * en LF (`.gitattributes`); sin normalizar, la deriva byte a byte falla en Windows y `api:generar`
 * deja el árbol de trabajo modificado.
 * @param {string} directorio
 */
async function normalizarFinDeLinea(directorio) {
  for (const archivo of await listarArchivos(directorio)) {
    const ruta = path.join(directorio, archivo);
    const contenido = await readFile(ruta, 'utf8');
    if (contenido.includes('\r\n')) await writeFile(ruta, contenido.replaceAll('\r\n', '\n'), 'utf8');
  }
}

/**
 * Lista las rutas relativas de todos los archivos bajo `directorio`, ordenadas.
 * @param {string} directorio
 */
async function listarArchivos(directorio) {
  const entradas = await readdir(directorio, { recursive: true, withFileTypes: true });
  return entradas
    .filter((entrada) => entrada.isFile())
    .map((entrada) => path.relative(directorio, path.join(entrada.parentPath, entrada.name)))
    .sort();
}

/**
 * `npm run api:generar`: regenera `src/app/api/` desde el contrato público. Lo generado no se edita a
 * mano (CLT2).
 * @param {Opciones} [opciones]
 * @returns {Promise<Resultado>}
 */
export async function generarApi(opciones = {}) {
  const raizCliente = resolverRaizCliente(opciones);
  const rutas = rutasDelCliente(raizCliente);
  if (!existsSync(rutas.bin)) {
    return { limpio: false, mensaje: `api:generar: falta el generador. ${AYUDA_INSTALAR}` };
  }
  await correrGenerador(raizCliente, opciones.contrato, rutas.generado);
  return { limpio: true, mensaje: 'api:generar: src/app/api/ regenerado desde openapi/openapi.json.' };
}

/**
 * `npm run api:deriva`: genera en una carpeta temporal y compara archivo por archivo, byte a byte,
 * con `src/app/api/`. Nunca escribe en el árbol de trabajo.
 * @param {Opciones} [opciones]
 * @returns {Promise<Resultado>}
 */
export async function verificarDerivaApi(opciones = {}) {
  const raizCliente = resolverRaizCliente(opciones);
  const rutas = rutasDelCliente(raizCliente);
  if (!existsSync(rutas.bin)) {
    return { limpio: false, mensaje: `api:deriva: falta el generador. ${AYUDA_INSTALAR}` };
  }
  const temporal = await mkdtemp(path.join(tmpdir(), 'luxe-cliente-'));
  try {
    await correrGenerador(raizCliente, opciones.contrato, temporal);
    const esperados = await listarArchivos(temporal);
    const guardados = existsSync(rutas.generado) ? await listarArchivos(rutas.generado) : [];
    const diferencias = [];
    for (const archivo of esperados) {
      if (!guardados.includes(archivo)) {
        diferencias.push(`falta ${archivo}`);
        continue;
      }
      const [generado, commiteado] = await Promise.all([
        readFile(path.join(temporal, archivo)),
        readFile(path.join(rutas.generado, archivo)),
      ]);
      if (!generado.equals(commiteado)) diferencias.push(`distinto ${archivo}`);
    }
    for (const archivo of guardados) {
      if (!esperados.includes(archivo)) diferencias.push(`sobra ${archivo}`);
    }
    if (diferencias.length > 0) {
      return {
        limpio: false,
        mensaje:
          `api:deriva: src/app/api/ no coincide con el contrato (${diferencias.join(', ')}). ` +
          'Corre npm run api:generar y commitea el resultado.',
      };
    }
    return { limpio: true, mensaje: `api:deriva: src/app/api/ coincide byte a byte (${esperados.length} archivos).` };
  } finally {
    await rm(temporal, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const comandos = { generar: generarApi, deriva: verificarDerivaApi };
  const comando = comandos[/** @type {'generar' | 'deriva'} */ (process.argv[2])];
  if (comando === undefined) {
    console.error('Uso: node herramientas/api.mjs <generar|deriva>');
    process.exit(2);
  }
  const resultado = await comando();
  (resultado.limpio ? console.log : console.error)(resultado.mensaje);
  process.exit(resultado.limpio ? 0 : 1);
}
