import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { resolverRaizRepositorio } from './herramientas.js';

/**
 * `auditoria` (CI4, D14). `npm audit --json` con un umbral de severidad explícito
 * (`openspec/config.yaml`/este script: `high`) y excepciones versionadas en
 * `auditoria-excepciones.json`. Una excepción vencida (`revisar_antes_de` en el pasado) MUST fallar
 * el paso nombrándola, sin importar si la vulnerabilidad original sigue presente: es lo que fuerza
 * a revisar la excepción periódicamente en vez de dejarla en silencio para siempre.
 */
export type Severidad = 'info' | 'low' | 'moderate' | 'high' | 'critical';

const ORDEN_SEVERIDAD: Record<Severidad, number> = {
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

export interface HallazgoAuditoria {
  readonly paquete: string;
  readonly severidad: Severidad;
}

export interface ExcepcionAuditoria {
  readonly id: string;
  readonly paquete: string;
  readonly motivo: string;
  readonly fecha: string;
  readonly revisar_antes_de: string;
}

export interface ResultadoAuditoria {
  readonly limpio: boolean;
  readonly mensaje: string;
}

function esSeveridadConocida(valor: string): valor is Severidad {
  return valor in ORDEN_SEVERIDAD;
}

/** Convierte la forma de `npm audit --json` (`vulnerabilities: { <paquete>: { severity } }`). */
export function parsearHallazgosNpmAudit(json: unknown): HallazgoAuditoria[] {
  if (typeof json !== 'object' || json === null || !('vulnerabilities' in json)) {
    return [];
  }
  const vulnerabilidades: unknown = json.vulnerabilities;
  if (typeof vulnerabilidades !== 'object' || vulnerabilidades === null) {
    return [];
  }
  const hallazgos: HallazgoAuditoria[] = [];
  for (const [paquete, detalle] of Object.entries(vulnerabilidades as Record<string, unknown>)) {
    if (typeof detalle !== 'object' || detalle === null || !('severity' in detalle)) {
      continue;
    }
    const severidad: unknown = detalle.severity;
    if (typeof severidad === 'string' && esSeveridadConocida(severidad)) {
      hallazgos.push({ paquete, severidad });
    }
  }
  return hallazgos;
}

function excepcionVigente(excepcion: ExcepcionAuditoria, fechaActual: Date): boolean {
  return new Date(excepcion.revisar_antes_de).getTime() >= fechaActual.getTime();
}

/**
 * Función pura: decide si el conjunto de hallazgos y excepciones deja el paso en verde o en rojo,
 * dada una fecha de referencia inyectada (nunca `Date.now()`/`new Date()` disperso en la lógica de
 * decisión; el único `new Date()` del módulo vive en el valor por defecto de `auditarDependencias`,
 * el borde del script, igual que el resto de scripts de esta tarea leen `process.env` en su borde).
 */
export function evaluarHallazgos(
  hallazgos: readonly HallazgoAuditoria[],
  excepciones: readonly ExcepcionAuditoria[],
  umbral: Severidad,
  fechaActual: Date,
): ResultadoAuditoria {
  const umbralNumerico = ORDEN_SEVERIDAD[umbral];
  const problemas: string[] = [];

  for (const excepcion of excepciones) {
    if (!excepcionVigente(excepcion, fechaActual)) {
      problemas.push(
        `excepción vencida "${excepcion.id}" (paquete ${excepcion.paquete}): revisar_antes_de ` +
          `${excepcion.revisar_antes_de} ya pasó — ${excepcion.motivo}`,
      );
    }
  }

  for (const hallazgo of hallazgos) {
    if (ORDEN_SEVERIDAD[hallazgo.severidad] < umbralNumerico) {
      continue;
    }
    const tieneExcepcionVigente = excepciones.some(
      (excepcion) => excepcion.paquete === hallazgo.paquete && excepcionVigente(excepcion, fechaActual),
    );
    if (!tieneExcepcionVigente) {
      problemas.push(`${hallazgo.paquete}: severidad ${hallazgo.severidad} (umbral configurado: ${umbral})`);
    }
  }

  if (problemas.length === 0) {
    return {
      limpio: true,
      mensaje: `auditoria: sin vulnerabilidades >= ${umbral} sin excepción vigente.`,
    };
  }
  return {
    limpio: false,
    mensaje: `auditoria: ${problemas.length} problema(s):\n${problemas.join('\n')}`,
  };
}

export async function cargarExcepciones(raiz: string): Promise<ExcepcionAuditoria[]> {
  const ruta = path.join(raiz, 'auditoria-excepciones.json');
  const contenido = await readFile(ruta, 'utf8');
  const datos = JSON.parse(contenido) as unknown;
  if (!Array.isArray(datos)) {
    throw new Error(`${ruta} MUST ser un array de excepciones.`);
  }
  return datos as ExcepcionAuditoria[];
}

/**
 * Corre `npm audit --json` de verdad. En Windows, `npm` es un shim `.cmd`/`.ps1`: Node rechaza
 * lanzarlo sin `shell: true` (EINVAL, protección de Node contra inyección de argumentos en
 * `.cmd`/`.bat` — https://nodejs.org/en/blog/vulnerability/april-2024-security-releases). La regla
 * transversal de "nunca shell: true" de `tasks.md` aplica a `ejecutarHerramienta` y a los scripts
 * de **git** (rutas con espacios, ver `herramientas.ts`/`verificar-commits.ts`); aquí no aplica: los
 * argumentos son literales fijos (`audit --json`), sin ninguna ruta ni valor externo interpolado.
 */
function ejecutarNpmAuditJson(raiz: string): unknown {
  try {
    const salida = execFileSync('npm', ['audit', '--json'], {
      cwd: raiz,
      encoding: 'utf8',
      shell: true,
      maxBuffer: 1024 * 1024 * 32,
    });
    return JSON.parse(salida);
  } catch (error) {
    const conSalida = error as { stdout?: string };
    if (typeof conSalida.stdout === 'string' && conSalida.stdout.trim().length > 0) {
      // `npm audit` sale con código != 0 cuando hay hallazgos; el JSON útil sigue en stdout.
      return JSON.parse(conSalida.stdout);
    }
    throw error;
  }
}

export interface OpcionesAuditarDependencias {
  readonly umbral?: Severidad;
  readonly fechaActual?: Date;
}

export async function auditarDependencias(
  raiz: string = resolverRaizRepositorio(),
  opciones: OpcionesAuditarDependencias = {},
): Promise<ResultadoAuditoria> {
  const umbral = opciones.umbral ?? 'high';
  const fechaActual = opciones.fechaActual ?? new Date();
  const [hallazgos, excepciones] = await Promise.all([
    Promise.resolve(parsearHallazgosNpmAudit(ejecutarNpmAuditJson(raiz))),
    cargarExcepciones(raiz),
  ]);
  return evaluarHallazgos(hallazgos, excepciones, umbral, fechaActual);
}
