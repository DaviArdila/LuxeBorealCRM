import { Test } from '@nestjs/testing';
import type { INestApplicationContext } from '@nestjs/common';
import { AppModule } from '../../../src/app.module.js';
import { LLM_PORT, type LlmPort } from '../../../src/modulos/llm/index.js';
import { CONFIGURACION, type Configuracion } from '../../../src/plataforma/config/index.js';
import { CONFIGURACION_AGENTE_DE_PRUEBA } from '../../soporte/configuracion-agente-de-prueba.js';
import { CONFIGURACION_LLM_DE_PRUEBA } from '../../soporte/configuracion-llm-de-prueba.js';
import { prefijoRedisDePrueba, urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';

export interface OpcionesComposicion {
  readonly llm: LlmPort;
  /** Apunta el adaptador de OpenRouter a un simulador: centinela de que ninguna llamada sale a la red (EVL1). */
  readonly urlOpenRouter?: string;
  readonly sobrescribir?: Partial<Configuracion>;
}

/** Configuración completa de la aplicación para las evals: sin workers de colas ni red externa. */
export function configuracionEvals(opciones: Pick<OpcionesComposicion, 'urlOpenRouter' | 'sobrescribir'>): Configuracion {
  return {
    NODE_ENV: 'test',
    PORT: 3000,
    LOG_LEVEL: 'silent',
    DATABASE_URL: urlPostgresDePrueba(),
    REDIS_URL: urlRedisDePrueba(),
    HEALTH_TIMEOUT_MS: 1500,
    DOCS_HABILITADO: false,
    MINIO_ENDPOINT: 'localhost',
    MINIO_PUERTO: 9000,
    MINIO_SSL: false,
    MINIO_ACCESS_KEY: 'luxe',
    MINIO_SECRET_KEY: 'luxeclave',
    MINIO_BUCKET: 'luxeboreal-medios',
    MINIO_URL_PUBLICA: undefined,
    CATALOGO_SHEET_ID: undefined,
    CHATWOOT_URL: 'http://localhost:3001',
    CHATWOOT_ACCOUNT_ID: 1,
    CHATWOOT_BOT_TOKEN: 'token-de-evals',
    CHATWOOT_WEBHOOK_SECRETO: 'secreto-de-evals',
    CHATWOOT_WEBHOOK_TOLERANCIA_S: 300,
    CHATWOOT_HTTP_TIMEOUT_MS: 5000,
    COLAS_PREFIJO: `${prefijoRedisDePrueba()}colas-evals`,
    COLAS_TRABAJADORES: false,
    INBOX_MAX_INTENTOS: 5,
    INBOX_BARRIDO_MS: 30000,
    OUTBOX_MAX_INTENTOS: 5,
    OUTBOX_BACKOFF_BASE_S: 1,
    OUTBOX_BACKOFF_MAX_S: 1,
    OUTBOX_BARRIDO_MS: 500,
    OUTBOX_LEASE_S: 60,
    HUMANO_TTL_HORAS: 3,
    HANDOFF_TTL_MIN: 45,
    LOCK_TURNO_TTL_S: 30,
    RATE_LIMIT_POR_HORA: 20,
    RATE_LIMIT_POR_DIA: 60,
    DEBOUNCE_MS: 200,
    CONVERSACIONES_CONCURRENCIA: 10,
    CONVERSACIONES_BARRIDO_MS: 300000,
    HANDOFF_ESPERA_MIN: 30,
    ...CONFIGURACION_AGENTE_DE_PRUEBA,
    ...CONFIGURACION_LLM_DE_PRUEBA,
    ...(opciones.urlOpenRouter === undefined ? {} : { OPENROUTER_BASE_URL: opciones.urlOpenRouter }),
    ...opciones.sobrescribir,
  };
}

/**
 * Compone la aplicación real (`AppModule`) para las evals (D1): Postgres y Redis de prueba, el agente
 * completo con sus herramientas reales y solo `LLM_PORT` sustituido por el puerto del arnés. Sin
 * workers de colas: las evals llaman directo al generador del turno, no pasan por el webhook.
 */
export async function componerAgente(opciones: OpcionesComposicion): Promise<INestApplicationContext> {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracionEvals(opciones))
    .overrideProvider(LLM_PORT)
    .useValue(opciones.llm)
    .compile();
  await modulo.init();
  return modulo;
}
