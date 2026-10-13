import { Test } from '@nestjs/testing';
import { VERSION_ASISTENTE, type VersionAsistente } from '../../../src/modulos/asistente/puertos/version-asistente.js';
import { GENERADOR_RESPUESTA, type GeneradorRespuesta } from '../../../src/modulos/conversaciones/index.js';
import { LLM_PORT, LlmModule, type LlmPort } from '../../../src/modulos/llm/index.js';
import { CONFIGURACION, ConfiguracionModule, type Configuracion } from '../../../src/plataforma/config/index.js';
import { PrismaService } from '../../../src/plataforma/prisma/index.js';
import { ClockSistema, RelojModule } from '../../../src/plataforma/reloj/index.js';
import { CONFIGURACION_LLM_DE_PRUEBA } from '../../soporte/configuracion-llm-de-prueba.js';
import type { ResultadoAsercion } from './aserciones.js';
import { componerAgente, configuracionEvals } from './componer-agente.js';
import { separarPorModoReal, type CasoEval } from './esquema-caso.js';
import { ejecutarCaso } from './ejecutar-caso.js';
import { GrabadorLlm } from './grabador-llm.js';
import { armarResumen, type CasoResumen } from './resumen.js';
import { aplicarEstiloCandidato } from './estilo-candidato.js';
import { sembrarBase } from './sembrar.js';
import { PLAZO_TURNO_REAL_S } from './plazo-real.js';
import { calcularVeredicto, REPETICIONES_REAL, type Veredicto } from './umbral.js';

export interface OpcionesCorridaReal {
  /** Ruta de un archivo de estilo para publicar en la base de la corrida antes de los casos (`EVALS_ESTILO`). */
  readonly estiloCandidato?: string;
  readonly casos: readonly CasoEval[];
  /** Clave de OpenRouter; obligatoria solo si algún modelo va por OpenRouter (sin prefijo). */
  readonly apiKey: string;
  /** Clave de OpenAI para los modelos `openai:` (ADR-0019). */
  readonly openaiApiKey?: string;
  /** Modelos del perfil `evals` (LLM_EVALS_MODELOS); el primero es el principal. */
  readonly modelos: readonly string[];
  readonly precios: Configuracion['LLM_PRECIOS_USD_JSON'];
  /** Solo para probar el cableado contra un simulador; en la corrida real es la URL de OpenRouter. */
  readonly urlOpenRouter?: string;
  readonly repeticiones?: number;
}

export interface CorridaReal {
  readonly veredicto: Veredicto;
  readonly resumenes: readonly CasoResumen[];
  readonly costoUsd: number;
  readonly modelosPorCaso: Readonly<Record<string, readonly string[]>>;
  /** `id` de los casos `soloGuionado` omitidos en esta corrida. */
  readonly omitidos: readonly string[];
  /** `id` de los casos que no terminaron todas sus repeticiones; con alguno, la corrida queda reprobada. */
  readonly incompletos: readonly string[];
  readonly texto: string;
}

/**
 * Lee de un entorno los modelos y precios del perfil `evals` (mismas variables que la aplicación):
 * `LLM_EVALS_MODELOS` separados por coma y `LLM_PRECIOS_USD_JSON`. Sin ellos, los de la configuración
 * de prueba (Luna).
 */
export function leerLlmRealDeEntorno(entorno: Readonly<Record<string, string | undefined>>): {
  readonly modelos: readonly string[];
  readonly precios: Configuracion['LLM_PRECIOS_USD_JSON'];
} {
  const modelos = (entorno['LLM_EVALS_MODELOS'] ?? '')
    .split(',')
    .map((modelo) => modelo.trim())
    .filter((modelo) => modelo.length > 0);
  const preciosCrudos = entorno['LLM_PRECIOS_USD_JSON'];
  return {
    modelos: modelos.length > 0 ? modelos : CONFIGURACION_LLM_DE_PRUEBA.LLM_EVALS_MODELOS,
    precios:
      preciosCrudos === undefined || preciosCrudos.trim() === ''
        ? CONFIGURACION_LLM_DE_PRUEBA.LLM_PRECIOS_USD_JSON
        : (JSON.parse(preciosCrudos) as Configuracion['LLM_PRECIOS_USD_JSON']),
  };
}

/** Una corrida real abierta: compone la aplicación una vez y ejecuta los casos de a uno (un `it` por caso). */
export interface SesionCorridaReal {
  /** Los casos que esta corrida ejecuta (sin los `soloGuionado`). */
  readonly ejecutables: readonly CasoEval[];
  /** Corre las repeticiones de un caso, en serie con cualquier otro caso de la sesión, y guarda sus resultados. */
  ejecutar(caso: CasoEval): Promise<readonly (readonly ResultadoAsercion[])[]>;
  /** Veredicto, costo y resumen con lo que terminó hasta ahora; un caso sin resultados reprueba la corrida. */
  resumir(): Promise<CorridaReal>;
  cerrar(): Promise<void>;
}

/**
 * Corrida contra el LLM real (D6 de la Fase 07c, EVL3/EVL4): el gateway de verdad con los modelos y el
 * timeout del perfil `evals` —el perfil de conversación de esta configuración de prueba se iguala al de
 * evals y `LOCK_TURNO_TTL_S` sube a {@link PLAZO_TURNO_REAL_S} para que el plazo del turno no recorte ese timeout— y cada caso
 * `repeticiones` veces (3 por defecto), cada una en una conversación nueva. Suma el costo desde `uso_llm`
 * de la base de prueba de la corrida; ese gasto no cuenta para el techo mensual de producción.
 *
 * Los casos corren en serie aunque su `it` se corte por plazo: el siguiente espera al anterior, así dos casos nunca
 * comparten el grabador del LLM a la vez.
 */
export async function iniciarCorridaReal(opciones: OpcionesCorridaReal): Promise<SesionCorridaReal> {
  const repeticiones = opciones.repeticiones ?? REPETICIONES_REAL;
  const { ejecutables, omitidos: casosOmitidos } = separarPorModoReal(opciones.casos);
  const omitidos = casosOmitidos.map((caso) => caso.id);
  const base = configuracionEvals({});
  const configuracion: Configuracion = {
    ...base,
    OPENROUTER_API_KEY: opciones.apiKey,
    OPENAI_API_KEY: opciones.openaiApiKey ?? '',
    ...(opciones.urlOpenRouter === undefined ? {} : { OPENROUTER_BASE_URL: opciones.urlOpenRouter }),
    LOCK_TURNO_TTL_S: PLAZO_TURNO_REAL_S,
    LLM_PRECIOS_USD_JSON: opciones.precios,
    LLM_EVALS_MODELOS: [...opciones.modelos],
    LLM_CONVERSACION_MODELOS: [...opciones.modelos],
    LLM_CONVERSACION_TIMEOUT_MS: base.LLM_EVALS_TIMEOUT_MS,
    LLM_CONVERSACION_MAX_TOKENS: base.LLM_EVALS_MAX_TOKENS,
    LLM_CONVERSACION_MAX_REINTENTOS: base.LLM_EVALS_MAX_REINTENTOS,
  };

  const moduloLlm = await Test.createTestingModule({ imports: [ConfiguracionModule, RelojModule, LlmModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracion)
    .compile();
  const gateway = moduloLlm.get<LlmPort>(LLM_PORT);
  const grabador = new GrabadorLlm(gateway);
  const app = await componerAgente({ llm: grabador, sobrescribir: configuracion });
  const generador = app.get<GeneradorRespuesta>(GENERADOR_RESPUESTA);
  const prisma = app.get(PrismaService);
  try {
    await sembrarBase(prisma);
    // EVL3: un estilo candidato (`EVALS_ESTILO`) se mide aquí, en la base de la corrida, antes de publicarlo.
    await aplicarEstiloCandidato(app, opciones.estiloCandidato);
  } catch (error) {
    await app.close();
    await moduloLlm.close();
    throw error;
  }
  const inicio = new ClockSistema().ahora();

  const porCaso = new Map<string, ResultadoAsercion[][]>();
  const conversacionesPorCaso = new Map<string, string[]>();
  let enCurso: Promise<unknown> = Promise.resolve();

  const correrCaso = async (caso: CasoEval): Promise<readonly (readonly ResultadoAsercion[])[]> => {
    const repeticionesDelCaso: ResultadoAsercion[][] = [];
    for (let repeticion = 0; repeticion < repeticiones; repeticion += 1) {
      const resultados = await ejecutarCaso({
        caso,
        generador,
        grabador,
        prisma,
        versionCasos: app.get<VersionAsistente>(VERSION_ASISTENTE, { strict: false }),
        llmReal: gateway,
        alCrearConversacion: (id) => conversacionesPorCaso.set(caso.id, [...(conversacionesPorCaso.get(caso.id) ?? []), id]),
      });
      repeticionesDelCaso.push([...resultados]);
      porCaso.set(caso.id, repeticionesDelCaso);
    }
    return repeticionesDelCaso;
  };

  return {
    ejecutables,
    ejecutar(caso) {
      const turno = enCurso.then(() => correrCaso(caso));
      enCurso = turno.catch(() => undefined);
      return turno;
    },
    async resumir() {
      await enCurso;
      const resumenes = ejecutables.map((caso) => {
        const porRepeticion = porCaso.get(caso.id) ?? [];
        return { id: caso.id, titulo: caso.titulo, resultados: porRepeticion.flat(), porRepeticion };
      });
      const incompletos = resumenes.filter((r) => r.porRepeticion.length < repeticiones).map((r) => r.id);
      const calculado = calcularVeredicto(resumenes.flatMap((r) => r.resultados), 'real');
      const veredicto = { ...calculado, aprobada: calculado.aprobada && incompletos.length === 0 };
      const usos = await prisma.usoLlm.findMany({ where: { creado: { gte: inicio } }, select: { conversacionId: true, modelo: true, costoEstimadoUsd: true } });
      const costoUsd = usos.reduce((suma, uso) => suma + Number(uso.costoEstimadoUsd), 0);
      const modelosPorCaso: Record<string, readonly string[]> = {};
      for (const [casoId, conversaciones] of conversacionesPorCaso) {
        modelosPorCaso[casoId] = [...new Set(usos.filter((u) => u.conversacionId !== null && conversaciones.includes(u.conversacionId)).map((u) => u.modelo))].sort();
      }
      return {
        veredicto,
        resumenes,
        costoUsd,
        modelosPorCaso,
        omitidos,
        incompletos,
        texto: armarResumen(resumenes, veredicto, 'real', { costoUsd, modelosPorCaso, omitidos, incompletos }),
      };
    },
    async cerrar() {
      await enCurso;
      await app.close();
      await moduloLlm.close();
    },
  };
}

/** La corrida real completa de una vez (la usa la prueba del cableado contra el simulador, EVL4). */
export async function ejecutarCorridaReal(opciones: OpcionesCorridaReal): Promise<CorridaReal> {
  const sesion = await iniciarCorridaReal(opciones);
  try {
    for (const caso of sesion.ejecutables) {
      await sesion.ejecutar(caso);
    }
    return await sesion.resumir();
  } finally {
    await sesion.cerrar();
  }
}
