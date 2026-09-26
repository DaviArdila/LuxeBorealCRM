import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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
};

export interface DocumentosContrato {
  readonly interno: string;
  readonly publico: string;
}

export interface ResultadoContrato {
  readonly limpio: boolean;
  readonly mensaje: string;
}

async function crearAplicacionDeGeneracion(): Promise<INestApplication> {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(CONFIGURACION_DE_GENERACION)
    .compile();

  const app = modulo.createNestApplication({ logger: false });
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
