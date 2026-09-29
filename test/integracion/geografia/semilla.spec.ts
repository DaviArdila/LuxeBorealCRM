import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  GeografiaModule,
  SembrarGeografia,
} from '../../../src/modulos/geografia/index.js';
import {
  CONFIGURACION,
  ConfiguracionModule,
  type Configuracion,
} from '../../../src/plataforma/config/index.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';
import { CONFIGURACION_LLM_DE_PRUEBA } from '../../soporte/configuracion-llm-de-prueba.js';

const RUTA_DIVIPOLA = path.join(import.meta.dirname, '../../../prisma/datos/divipola.json');
const RUTA_PROCEDENCIA = path.join(
  import.meta.dirname,
  '../../../prisma/datos/divipola.procedencia.json',
);

interface Procedencia {
  readonly fuente: string;
  readonly descargado: string;
  readonly sha256: string;
  readonly filas: number;
  readonly departamentos: number;
  readonly ciudades: number;
}

let textoFuenteReal: string;
let cerrarModulo: (() => Promise<void>) | undefined;

beforeAll(async () => {
  textoFuenteReal = await readFile(RUTA_DIVIPOLA, 'utf8');
});

afterEach(async () => {
  await cerrarModulo?.();
  cerrarModulo = undefined;
});

async function crearCasoDeUso(): Promise<SembrarGeografia> {
  const configuracionDePrueba: Configuracion = {
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
    CHATWOOT_BOT_TOKEN: '',
    CHATWOOT_WEBHOOK_SECRETO: '',
    CHATWOOT_WEBHOOK_TOLERANCIA_S: 300,
    CHATWOOT_HTTP_TIMEOUT_MS: 10000,
    COLAS_PREFIJO: 'luxe:colas',
    COLAS_TRABAJADORES: true,
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
    ...CONFIGURACION_LLM_DE_PRUEBA,
  };

  const modulo = await Test.createTestingModule({
    imports: [ConfiguracionModule, GeografiaModule],
  })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracionDePrueba)
    .compile();
  cerrarModulo = () => modulo.close();

  return modulo.get(SembrarGeografia);
}

async function conectarPostgres(): Promise<Client> {
  const cliente = new Client({ connectionString: urlPostgresDePrueba() });
  await cliente.connect();
  return cliente;
}

describe('Semilla DANE (T4, integración)', () => {
  it('PER11 — Ejecutar la semilla dos veces deja los mismos departamentos y ciudades', async () => {
    const casoDeUso = await crearCasoDeUso();
    const cliente = await conectarPostgres();

    try {
      await casoDeUso.ejecutar(textoFuenteReal);
      const departamentosPrimeraCorrida = await cliente.query(
        'SELECT id, nombre FROM departamento ORDER BY id',
      );
      const ciudadesPrimeraCorrida = await cliente.query(
        'SELECT id, departamento_id, nombre FROM ciudad ORDER BY id',
      );

      await casoDeUso.ejecutar(textoFuenteReal);
      const departamentosSegundaCorrida = await cliente.query(
        'SELECT id, nombre FROM departamento ORDER BY id',
      );
      const ciudadesSegundaCorrida = await cliente.query(
        'SELECT id, departamento_id, nombre FROM ciudad ORDER BY id',
      );

      expect(departamentosSegundaCorrida.rows).toEqual(departamentosPrimeraCorrida.rows);
      expect(ciudadesSegundaCorrida.rows).toEqual(ciudadesPrimeraCorrida.rows);
    } finally {
      await cliente.end();
    }
  });

  it('PER11 — La segunda ejecución de la semilla no inserta ni actualiza ninguna fila', async () => {
    const casoDeUso = await crearCasoDeUso();

    await casoDeUso.ejecutar(textoFuenteReal);
    const resumenSegundaCorrida = await casoDeUso.ejecutar(textoFuenteReal);

    expect(resumenSegundaCorrida.departamentos.insertados).toBe(0);
    expect(resumenSegundaCorrida.departamentos.actualizados).toBe(0);
    expect(typeof resumenSegundaCorrida.departamentos.sinCambios).toBe('number');
    expect(resumenSegundaCorrida.ciudades.insertados).toBe(0);
    expect(resumenSegundaCorrida.ciudades.actualizados).toBe(0);
    expect(typeof resumenSegundaCorrida.ciudades.sinCambios).toBe('number');
  });

  it('PER12 — La semilla solo escribe filas en departamento y ciudad', async () => {
    const casoDeUso = await crearCasoDeUso();
    const cliente = await conectarPostgres();

    try {
      await casoDeUso.ejecutar(textoFuenteReal);

      const tablas = await cliente.query<{ nombre: string }>(`
        SELECT table_name AS nombre
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
          AND table_name NOT IN ('_prisma_migrations', 'departamento', 'ciudad')
        ORDER BY table_name
      `);
      expect(tablas.rows.length).toBeGreaterThan(0);

      for (const { nombre } of tablas.rows) {
        const conteo = await cliente.query<{ cantidad: string }>(
          `SELECT COUNT(*)::text AS cantidad FROM "${nombre}"`,
        );
        expect(Number(conteo.rows[0]?.cantidad)).toBe(0);
      }
    } finally {
      await cliente.end();
    }
  });

  it('PER12 — El archivo de procedencia documenta fuente, fecha, hash y conteos', async () => {
    const bufferReal = await readFile(RUTA_DIVIPOLA);
    const procedencia = JSON.parse(await readFile(RUTA_PROCEDENCIA, 'utf8')) as Procedencia;

    expect(procedencia.fuente).toMatch(/^https:\/\/www\.datos\.gov\.co\//u);
    expect(procedencia.descargado).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    expect(typeof procedencia.filas).toBe('number');
    expect(typeof procedencia.departamentos).toBe('number');
    expect(typeof procedencia.ciudades).toBe('number');

    const hashReal = createHash('sha256').update(bufferReal).digest('hex');
    expect(procedencia.sha256).toBe(hashReal);
  });
});
