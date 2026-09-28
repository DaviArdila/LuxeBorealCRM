import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CONFIGURACION,
  ConfiguracionModule,
  type Configuracion,
} from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';

const TABLAS_V1 = [
  'categoria_producto',
  'producto',
  'foto',
  'parametro',
  'departamento',
  'ciudad',
  'zona_sin_cobertura',
  'tarifa_estimada',
  'evento_fuera_cobertura',
  'contacto',
  'conversacion',
  'lead',
  'excepcion_horario',
  'usuario',
  'movimiento_inventario',
  'venta',
  'venta_item',
  'envio',
  'evento_entrante',
  'outbox',
  'uso_llm',
] as const;

const EXCEPCIONES_PK = new Map([
  ['departamento', { columnas: ['id'], tipos: ['text'] }],
  ['ciudad', { columnas: ['id'], tipos: ['text'] }],
  ['parametro', { columnas: ['clave'], tipos: ['text'] }],
  ['excepcion_horario', { columnas: ['fecha'], tipos: ['date'] }],
]);

interface LlavePrimaria {
  readonly tabla: string;
  readonly columnas: string[];
  readonly tipos: string[];
}

let cerrarModuloPrisma: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cerrarModuloPrisma?.();
  cerrarModuloPrisma = undefined;
});

async function conectarPostgres(): Promise<Client> {
  const cliente = new Client({ connectionString: urlPostgresDePrueba() });
  await cliente.connect();
  return cliente;
}

async function consultarLlavesPrimarias(cliente: Client): Promise<LlavePrimaria[]> {
  const resultado = await cliente.query<LlavePrimaria>(`
    SELECT
      tabla.relname::text AS tabla,
      array_agg(columna.attname::text ORDER BY clave.ordinalidad) AS columnas,
      array_agg(format_type(columna.atttypid, columna.atttypmod) ORDER BY clave.ordinalidad) AS tipos
    FROM pg_constraint AS restriccion
    JOIN pg_class AS tabla ON tabla.oid = restriccion.conrelid
    JOIN pg_namespace AS esquema ON esquema.oid = tabla.relnamespace
    CROSS JOIN LATERAL unnest(restriccion.conkey) WITH ORDINALITY AS clave(attnum, ordinalidad)
    JOIN pg_attribute AS columna
      ON columna.attrelid = tabla.oid
      AND columna.attnum = clave.attnum
    WHERE restriccion.contype = 'p'
      AND esquema.nspname = 'public'
    GROUP BY tabla.relname
    ORDER BY tabla.relname
  `);

  return resultado.rows;
}

describe('Invariantes del esquema v1 (T2, integración)', () => {
  it('PER2 — Todas las tablas de v1 existen tras la migración inicial', async () => {
    const cliente = await conectarPostgres();

    try {
      const resultado = await cliente.query<{ nombre: string }>(`
        SELECT table_name AS nombre
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
          AND table_name <> '_prisma_migrations'
        ORDER BY table_name
      `);

      expect(resultado.rows.map((fila) => fila.nombre)).toEqual([...TABLAS_V1].sort());
    } finally {
      await cliente.end();
    }
  });

  it('PER2 — evento_entrante rechaza un duplicado de origen e id externo', async () => {
    const cliente = await conectarPostgres();
    const origen = 'chatwoot';
    const idExterno = `evento-${randomUUID()}`;
    const insertar = (id: string) =>
      cliente.query(
        `INSERT INTO evento_entrante (id, origen, id_externo, payload)
         VALUES ($1::uuid, $2, $3, $4::jsonb)`,
        [id, origen, idExterno, JSON.stringify({ tipo: 'message_created' })],
      );

    try {
      await insertar(randomUUID());

      await expect(insertar(randomUUID())).rejects.toMatchObject({ code: '23505' });
    } finally {
      await cliente.end();
    }
  });

  it('PER3 — Las tablas sin excepción usan uuid v7 como llave primaria', async () => {
    const cliente = await conectarPostgres();

    try {
      const llaves = await consultarLlavesPrimarias(cliente);
      const llavesPorTabla = new Map(llaves.map((llave) => [llave.tabla, llave]));
      llavesPorTabla.delete('_prisma_migrations');

      expect([...llavesPorTabla.keys()].sort()).toEqual([...TABLAS_V1].sort());
      for (const tabla of TABLAS_V1) {
        if (EXCEPCIONES_PK.has(tabla)) continue;

        const llave = llavesPorTabla.get(tabla);
        expect(llave && { columnas: llave.columnas, tipos: llave.tipos }).toEqual({
          columnas: ['id'],
          tipos: ['uuid'],
        });
      }
    } finally {
      await cliente.end();
    }
  });

  it('PER3 — Un id creado por PrismaService trae el nibble de versión 7', async () => {
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
    };

    const modulo = await Test.createTestingModule({
      imports: [ConfiguracionModule, PrismaModule],
    })
      .overrideProvider(CONFIGURACION)
      .useValue(configuracionDePrueba)
      .compile();
    cerrarModuloPrisma = () => modulo.close();

    const prisma = modulo.get(PrismaService);
    const categoria = await prisma.categoriaProducto.create({
      data: { nombre: `categoria-t2-${randomUUID()}` },
    });

    expect(categoria.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu);
    expect(categoria.id.charAt(14)).toBe('7');
  });

  it('PER3 — Las excepciones de ADR-0007 conservan su llave natural', async () => {
    const cliente = await conectarPostgres();

    try {
      const llaves = await consultarLlavesPrimarias(cliente);
      const llavesPorTabla = new Map(llaves.map((llave) => [llave.tabla, llave]));

      for (const [tabla, esperada] of EXCEPCIONES_PK) {
        const llave = llavesPorTabla.get(tabla);
        expect(llave && { columnas: llave.columnas, tipos: llave.tipos }).toEqual(esperada);
      }
    } finally {
      await cliente.end();
    }
  });

  it('PER3 — venta.numero es un consecutivo único que no es la llave primaria', async () => {
    const cliente = await conectarPostgres();

    try {
      const llaves = await consultarLlavesPrimarias(cliente);
      const llaveVenta = llaves.find((llave) => llave.tabla === 'venta');
      expect(llaveVenta && { columnas: llaveVenta.columnas, tipos: llaveVenta.tipos }).toEqual({
        columnas: ['id'],
        tipos: ['uuid'],
      });

      const columna = await cliente.query<{
        tipo: string;
        valorPorDefecto: string | null;
      }>(`
        SELECT data_type AS tipo, column_default AS "valorPorDefecto"
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'venta'
          AND column_name = 'numero'
      `);
      expect(columna.rows[0]?.tipo).toBe('integer');
      expect(columna.rows[0]?.valorPorDefecto).toMatch(/^nextval\(/u);

      const unicidad = await cliente.query<{ unica: boolean }>(`
        SELECT EXISTS (
          SELECT 1
          FROM pg_index AS indice
          WHERE indice.indrelid = 'public.venta'::regclass
            AND indice.indisunique
            AND indice.indnkeyatts = 1
            AND indice.indnatts = 1
            AND (
              SELECT array_agg(columna.attname::text ORDER BY clave.ordinalidad)
              FROM unnest(indice.indkey) WITH ORDINALITY AS clave(attnum, ordinalidad)
              JOIN pg_attribute AS columna
                ON columna.attrelid = indice.indrelid
                AND columna.attnum = clave.attnum
            ) = ARRAY['numero']::text[]
        ) AS unica
      `);
      expect(unicidad.rows[0]?.unica).toBe(true);
    } finally {
      await cliente.end();
    }
  });

  it('PER4 — La llave primaria de contacto es su propio id, no el teléfono', async () => {
    const cliente = await conectarPostgres();

    try {
      const llaves = await consultarLlavesPrimarias(cliente);
      const llaveContacto = llaves.find((llave) => llave.tabla === 'contacto');
      expect(llaveContacto && { columnas: llaveContacto.columnas, tipos: llaveContacto.tipos }).toEqual({
        columnas: ['id'],
        tipos: ['uuid'],
      });

      const referenciasTelefono = await cliente.query<{ cantidad: number }>(`
        SELECT COUNT(*)::int AS cantidad
        FROM information_schema.key_column_usage AS columna
        JOIN information_schema.table_constraints AS restriccion
          ON restriccion.constraint_schema = columna.constraint_schema
          AND restriccion.constraint_name = columna.constraint_name
          AND restriccion.table_schema = columna.table_schema
          AND restriccion.table_name = columna.table_name
        LEFT JOIN information_schema.constraint_column_usage AS referencia
          ON referencia.constraint_catalog = restriccion.constraint_catalog
          AND referencia.constraint_schema = restriccion.constraint_schema
          AND referencia.constraint_name = restriccion.constraint_name
        WHERE restriccion.constraint_type = 'FOREIGN KEY'
          AND restriccion.table_schema = 'public'
          AND (
            (columna.table_name = 'contacto' AND columna.column_name = 'telefono')
            OR (
              referencia.table_name = 'contacto'
              AND referencia.column_name = 'telefono'
            )
          )
      `);
      expect(referenciasTelefono.rows[0]?.cantidad).toBe(0);
    } finally {
      await cliente.end();
    }
  });

  it('PER4 — El teléfono es único cuando está presente', async () => {
    const cliente = await conectarPostgres();
    const telefono = '573001234567';

    try {
      await cliente.query('INSERT INTO contacto (id, telefono) VALUES ($1::uuid, $2)', [
        randomUUID(),
        telefono,
      ]);

      await expect(
        cliente.query('INSERT INTO contacto (id, telefono) VALUES ($1::uuid, $2)', [
          randomUUID(),
          telefono,
        ]),
      ).rejects.toMatchObject({ code: '23505' });
    } finally {
      await cliente.end();
    }
  });

  it('PER4 — Dos contactos sin teléfono conocido pueden coexistir', async () => {
    const cliente = await conectarPostgres();
    const ids = [randomUUID(), randomUUID()];

    try {
      for (const id of ids) {
        await cliente.query('INSERT INTO contacto (id, telefono) VALUES ($1::uuid, NULL)', [id]);
      }

      const guardados = await cliente.query<{ telefono: string | null }>(
        'SELECT telefono FROM contacto WHERE id = ANY($1::uuid[]) ORDER BY id',
        [ids],
      );
      expect(guardados.rows).toEqual([{ telefono: null }, { telefono: null }]);
    } finally {
      await cliente.end();
    }
  });

  it('PER5 — conversacion.version existe con valor por defecto cero', async () => {
    const cliente = await conectarPostgres();
    const contactoId = randomUUID();
    const conversacionId = randomUUID();

    try {
      await cliente.query('INSERT INTO contacto (id) VALUES ($1::uuid)', [contactoId]);
      await cliente.query(
        `INSERT INTO conversacion (id, contacto_id, chatwoot_conversation_id, canal, estado)
         VALUES ($1::uuid, $2::uuid, $3, 'web', 'bot')`,
        [conversacionId, contactoId, 1_234_567_891],
      );

      const conversacion = await cliente.query<{ version: number }>(
        'SELECT version FROM conversacion WHERE id = $1::uuid',
        [conversacionId],
      );
      expect(conversacion.rows[0]?.version).toBe(0);
    } finally {
      await cliente.end();
    }
  });
});
