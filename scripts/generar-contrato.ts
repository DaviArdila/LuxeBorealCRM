import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';
import { CONFIGURACION, type Configuracion } from '../src/plataforma/config/index.js';
import {
  construirDocumentoInterno,
  filtrarDocumentoPublico,
  ordenarDocumento,
  serializarDocumento,
} from '../src/plataforma/documentacion/index.js';
import { resolverRaizRepositorio } from './herramientas.js';

const CONFIGURACION_DE_GENERACION: Configuracion = {
  NODE_ENV: 'test',
  PORT: 3000,
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://usuario:clave@localhost:5432/inexistente',
  REDIS_URL: 'redis://localhost:6379/0',
  HEALTH_TIMEOUT_MS: 1500,
  // El contrato commiteado documenta /docs a través de esquemaRespuestaSalud, sin necesidad de
  // montarlo de verdad (D7 de T4): la generación nunca depende de si /docs está habilitado.
  DOCS_HABILITADO: false,
  MINIO_ENDPOINT: 'localhost',
  MINIO_PUERTO: 9000,
  MINIO_SSL: false,
  MINIO_ACCESS_KEY: 'luxe',
  MINIO_SECRET_KEY: 'luxeclave',
  MINIO_BUCKET: 'luxeboreal-medios',
  MINIO_URL_PUBLICA: undefined,
  CATALOGO_SHEET_ID: undefined,
  // Fase 04, T3: la generación del contrato no envía cuerpos al webhook; solo necesitan cumplir
  // el formato que exige esquemaConfiguracion.
  CHATWOOT_URL: 'http://localhost:3001',
  CHATWOOT_ACCOUNT_ID: 1,
  CHATWOOT_BOT_TOKEN: '',
  CHATWOOT_WEBHOOK_SECRETO: '',
  CHATWOOT_WEBHOOK_TOLERANCIA_S: 300,
  CHATWOOT_HTTP_TIMEOUT_MS: 10000,
  COLAS_PREFIJO: 'luxe:colas',
  // Sin Redis real en este contexto (D6): registra la cola pero nunca arranca un worker, para que
  // la generación del contrato siga siendo determinista.
  COLAS_TRABAJADORES: false,
  INBOX_MAX_INTENTOS: 5,
  INBOX_BARRIDO_MS: 30000,
  OUTBOX_MAX_INTENTOS: 5,
  OUTBOX_BACKOFF_BASE_S: 15,
  OUTBOX_BACKOFF_MAX_S: 300,
  OUTBOX_BARRIDO_MS: 5000,
  OUTBOX_LEASE_S: 60,
  HUMANO_TTL_HORAS: 3,
  HANDOFF_TTL_MIN: 45,
  LOCK_TURNO_TTL_S: 30,
  RATE_LIMIT_POR_HORA: 20,
  RATE_LIMIT_POR_DIA: 60,
  DEBOUNCE_MS: 3000,
  CONVERSACIONES_CONCURRENCIA: 10,
  CONVERSACIONES_BARRIDO_MS: 300000,
  HANDOFF_ESPERA_MIN: 30,
  // Fase 06, T3: `llm` aún no está en `AppModule`; los valores solo cumplen `esquemaConfiguracion`.
  LLM_CONVERSACION_MODELOS: ['openai/gpt-5.6-luna'],
  LLM_CONVERSACION_TIMEOUT_MS: 15000,
  LLM_CONVERSACION_MAX_TOKENS: 400,
  LLM_CONVERSACION_MAX_REINTENTOS: 2,
  LLM_EVALS_MODELOS: ['openai/gpt-5.6-luna'],
  LLM_EVALS_TIMEOUT_MS: 30000,
  LLM_EVALS_MAX_TOKENS: 400,
  LLM_EVALS_MAX_REINTENTOS: 2,
  LLM_TECHO_MENSUAL_USD: 10,
  LLM_UMBRAL_AVISO_PCT: 80,
  LLM_PRECIOS_USD_JSON: { 'openai/gpt-5.6-luna': { entrada: 0.2, salida: 1.2, cache: 0.02 } },
  LLM_REINTENTO_BASE_MS: 500,
  LLM_REINTENTO_MAX_MS: 2000,
  LLM_CB_UMBRAL_FALLOS: 5,
  LLM_CB_VENTANA_S: 60,
  OPENROUTER_API_KEY: '',
  OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
  // Fase 07a, T4: el agente entra en `AppModule`; los valores solo cumplen `esquemaConfiguracion`.
  AGENTE_TOPE_TURNOS: 12,
  AGENTE_SESION_TTL_H: 168,
  AGENTE_MAX_VUELTAS: 5,
  AGENTE_HISTORIAL_TURNOS: 6,
  AGENTE_FOTOS_INDIVIDUALES_MAX: 4,
};

export interface DocumentosContrato {
  readonly interno: string;
  readonly publico: string;
}

export interface ResultadoContrato {
  readonly limpio: boolean;
  readonly mensaje: string;
}

async function crearAplicacionDeGeneracion(): Promise<NestExpressApplication> {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(CONFIGURACION_DE_GENERACION)
    .compile();

  const app = modulo.createNestApplication<NestExpressApplication>({ logger: false });
  try {
    configurarAplicacion(app);
    await app.init();
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}

/** Genera ambos textos desde una sola app real y una sola llamada a SwaggerModule. */
export async function construirDocumentosContrato(): Promise<DocumentosContrato> {
  const app = await crearAplicacionDeGeneracion();
  try {
    const documentoInterno = construirDocumentoInterno(app);
    const documentoPublico = filtrarDocumentoPublico(documentoInterno);

    return {
      interno: serializarDocumento(ordenarDocumento(documentoInterno)),
      publico: serializarDocumento(ordenarDocumento(documentoPublico)),
    };
  } finally {
    await app.close();
  }
}

/** Escribe los dos documentos versionados; la CLI vive en `scripts/cli.ts` por D12. */
export async function generarContrato(): Promise<ResultadoContrato> {
  try {
    const raiz = resolverRaizRepositorio();
    const documentos = await construirDocumentosContrato();
    const directorio = path.join(raiz, 'openapi');
    await mkdir(directorio, { recursive: true });
    await Promise.all([
      writeFile(path.join(directorio, 'openapi.interno.json'), documentos.interno, 'utf8'),
      writeFile(path.join(directorio, 'openapi.json'), documentos.publico, 'utf8'),
    ]);

    return {
      limpio: true,
      mensaje: 'contrato:generar: escritos openapi/openapi.interno.json y openapi/openapi.json.',
    };
  } catch (error) {
    return {
      limpio: false,
      mensaje: `contrato:generar: no se pudo construir o escribir el contrato: ${(error as Error).message}`,
    };
  }
}
