import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { resolverRaizRepositorio } from './herramientas.js';

const ejecutar = promisify(execFile);

export interface ResultadoCliente {
  readonly limpio: boolean;
  readonly mensaje: string;
}

export interface OpcionesCliente {
  /** Raíz del repositorio; por defecto la que resuelve git. */
  readonly raiz?: string;
  /** Contrato OpenAPI de entrada; por defecto `openapi/openapi.json` (el público). */
  readonly contrato?: string;
}

const AYUDA_INSTALAR = 'Instala las dependencias del cliente con: npm --prefix cliente ci';

function rutasDelCliente(raiz: string) {
  const cliente = path.join(raiz, 'cliente');
  return {
    cliente,
    config: path.join(cliente, 'ng-openapi-gen.json'),
    generado: path.join(cliente, 'src', 'app', 'api'),
    bin: path.join(cliente, 'node_modules', 'ng-openapi-gen', 'lib', 'index.js'),
    contratoPorDefecto: path.join(raiz, 'openapi', 'openapi.json'),
  };
}

async function correrGenerador(raiz: string, contrato: string | undefined, salida: string): Promise<void> {
  const rutas = rutasDelCliente(raiz);
  const args = [rutas.bin, '-c', rutas.config, '--output', salida];
  args.push('--input', contrato ?? rutas.contratoPorDefecto);
  await ejecutar(process.execPath, args, { cwd: rutas.cliente, maxBuffer: 16 * 1024 * 1024 });
  await normalizarFinDeLinea(salida);
}

/**
 * `ng-openapi-gen` escribe con el fin de línea del sistema (CRLF en Windows) y git guarda lo generado
 * en LF (`.gitattributes`); sin normalizar, la deriva byte a byte falla en Windows y `cliente:generar`
 * deja el árbol de trabajo modificado.
 */
async function normalizarFinDeLinea(directorio: string): Promise<void> {
  for (const archivo of await listarArchivos(directorio)) {
    const ruta = path.join(directorio, archivo);
    const contenido = await readFile(ruta, 'utf8');
    if (contenido.includes('\r\n')) await writeFile(ruta, contenido.replaceAll('\r\n', '\n'), 'utf8');
  }
}

/** Lista las rutas relativas de todos los archivos bajo `directorio`, ordenadas. */
async function listarArchivos(directorio: string): Promise<string[]> {
  const entradas = await readdir(directorio, { recursive: true, withFileTypes: true });
  return entradas
    .filter((entrada) => entrada.isFile())
    .map((entrada) => path.relative(directorio, path.join(entrada.parentPath, entrada.name)))
    .sort();
}

/**
 * `npm run cliente:generar` (D8 de la Fase 11b): regenera `cliente/src/app/api/` desde el contrato
 * público. Lo generado no se edita a mano (CLT2).
 */
export async function generarCliente(opciones: OpcionesCliente = {}): Promise<ResultadoCliente> {
  const raiz = opciones.raiz ?? resolverRaizRepositorio();
  const rutas = rutasDelCliente(raiz);
  if (!existsSync(rutas.bin)) {
    return { limpio: false, mensaje: `cliente:generar: falta el generador. ${AYUDA_INSTALAR}` };
  }
  await correrGenerador(raiz, opciones.contrato, rutas.generado);
  return { limpio: true, mensaje: 'cliente:generar: cliente/src/app/api/ regenerado desde openapi/openapi.json.' };
}

/**
 * `npm run cliente:deriva` (D8): genera en una carpeta temporal y compara archivo por archivo, byte a
 * byte, con `cliente/src/app/api/`. Nunca escribe en el árbol de trabajo.
 */
export async function verificarDerivaCliente(opciones: OpcionesCliente = {}): Promise<ResultadoCliente> {
  const raiz = opciones.raiz ?? resolverRaizRepositorio();
  const rutas = rutasDelCliente(raiz);
  if (!existsSync(rutas.bin)) {
    return { limpio: false, mensaje: `cliente:deriva: falta el generador. ${AYUDA_INSTALAR}` };
  }
  const temporal = await mkdtemp(path.join(tmpdir(), 'luxe-cliente-'));
  try {
    await correrGenerador(raiz, opciones.contrato, temporal);
    const esperados = await listarArchivos(temporal);
    const guardados = existsSync(rutas.generado) ? await listarArchivos(rutas.generado) : [];
    const diferencias: string[] = [];
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
          `cliente:deriva: cliente/src/app/api/ no coincide con el contrato (${diferencias.join(', ')}). ` +
          'Corre npm run cliente:generar y commitea el resultado.',
      };
    }
    return { limpio: true, mensaje: `cliente:deriva: cliente/src/app/api/ coincide byte a byte (${esperados.length} archivos).` };
  } finally {
    await rm(temporal, { recursive: true, force: true });
  }
}
