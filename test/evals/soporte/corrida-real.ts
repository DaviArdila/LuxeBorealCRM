import { Test } from '@nestjs/testing';
import { GENERADOR_RESPUESTA, type GeneradorRespuesta } from '../../../src/modulos/conversaciones/index.js';
import { LLM_PORT, LlmModule, type LlmPort } from '../../../src/modulos/llm/index.js';
import { CONFIGURACION, ConfiguracionModule, type Configuracion } from '../../../src/plataforma/config/index.js';
import { PrismaService } from '../../../src/plataforma/prisma/index.js';
import { ClockSistema, RelojModule } from '../../../src/plataforma/reloj/index.js';
import { CONFIGURACION_LLM_DE_PRUEBA } from '../../soporte/configuracion-llm-de-prueba.js';
import type { ResultadoAsercion } from './aserciones.js';
import { componerAgente, configuracionEvals } from './componer-agente.js';
import type { CasoEval } from './esquema-caso.js';
import { ejecutarCaso } from './ejecutar-caso.js';
import { GrabadorLlm } from './grabador-llm.js';
import { armarResumen, type CasoResumen } from './resumen.js';
import { sembrarBase } from './sembrar.js';
import { calcularVeredicto, REPETICIONES_REAL, type Veredicto } from './umbral.js';

export interface OpcionesCorridaReal {
  readonly casos: readonly CasoEval[];
  readonly apiKey: string;
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

/**
 * Corrida contra el LLM real (D6 de la Fase 07c, EVL3/EVL4): el gateway de verdad con los modelos y el
 * timeout del perfil `evals` —el perfil de conversación de esta configuración de prueba se iguala al de
 * evals y `LOCK_TURNO_TTL_S` sube a 60 para que el plazo del turno no recorte ese timeout— y cada caso
 * `repeticiones` veces (3 por defecto), cada una en una conversación nueva. Suma el costo desde `uso_llm`
 * de la base de prueba de la corrida; ese gasto no cuenta para el techo mensual de producción.
 */
export async function ejecutarCorridaReal(opciones: OpcionesCorridaReal): Promise<CorridaReal> {
  const repeticiones = opciones.repeticiones ?? REPETICIONES_REAL;
  const base = configuracionEvals({});
  const configuracion: Configuracion = {
    ...base,
    OPENROUTER_API_KEY: opciones.apiKey,
    ...(opciones.urlOpenRouter === undefined ? {} : { OPENROUTER_BASE_URL: opciones.urlOpenRouter }),
    LOCK_TURNO_TTL_S: 60,
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
  try {
    const generador = app.get<GeneradorRespuesta>(GENERADOR_RESPUESTA);
    const prisma = app.get(PrismaService);
    await sembrarBase(prisma);
    const inicio = new ClockSistema().ahora();

    const acumulado = new Map<string, ResultadoAsercion[]>();
    const conversacionesPorCaso = new Map<string, string[]>();
    for (const caso of opciones.casos) {
      for (let repeticion = 0; repeticion < repeticiones; repeticion += 1) {
        const resultados = await ejecutarCaso({
          caso,
          generador,
          grabador,
          prisma,
          llmReal: gateway,
          alCrearConversacion: (id) => conversacionesPorCaso.set(caso.id, [...(conversacionesPorCaso.get(caso.id) ?? []), id]),
        });
        acumulado.set(caso.id, [...(acumulado.get(caso.id) ?? []), ...resultados]);
      }
    }

    const resumenes = opciones.casos.map((caso) => ({
      id: caso.id,
      titulo: caso.titulo,
      resultados: acumulado.get(caso.id) ?? [],
    }));
    const veredicto = calcularVeredicto(resumenes.flatMap((r) => r.resultados), 'real');
    const usos = await prisma.usoLlm.findMany({ where: { creado: { gte: inicio } }, select: { conversacionId: true, modelo: true, costoEstimadoUsd: true } });
    const costoUsd = usos.reduce((suma, uso) => suma + Number(uso.costoEstimadoUsd), 0);
    const modelosPorCaso: Record<string, readonly string[]> = {};
    for (const [casoId, conversaciones] of conversacionesPorCaso) {
      modelosPorCaso[casoId] = [...new Set(usos.filter((u) => u.conversacionId !== null && conversaciones.includes(u.conversacionId)).map((u) => u.modelo))].sort();
    }
    return { veredicto, resumenes, costoUsd, modelosPorCaso, texto: armarResumen(resumenes, veredicto, 'real', { costoUsd, modelosPorCaso }) };
  } finally {
    await app.close();
    await moduloLlm.close();
  }
}
